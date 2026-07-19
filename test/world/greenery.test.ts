import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { variantsFor, frondGeo, collectForestSpots, FOREST_TREE_CAP, buildGreenery } from '../../src/world/greenery'
import { pointInPolygon } from '../../src/physics/collide'
import type { Vec2 } from '../../src/geo/types'

/** A deterministic PRNG for the tests, so counts are stable across runs. */
function testRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An axis-aligned square ring, `size` metres on a side, cornered at the origin. */
function square(size: number): Vec2[] {
  return [
    { x: 0, z: 0 },
    { x: size, z: 0 },
    { x: size, z: size },
    { x: 0, z: size },
  ]
}

const names = (lat: number): string[] => variantsFor(lat).map((v) => v.name)
const hasPalm = (lat: number): boolean => names(lat).includes('palm')

describe('variantsFor', () => {
  it('grows palms in the tropics and subtropics', () => {
    for (const lat of [0, 12.9, 25.2, 35.7]) expect(hasPalm(lat), `${lat}`).toBe(true)
  })

  it('grows no palms up north', () => {
    for (const lat of [55.75, 59.94, 64.1]) expect(hasPalm(lat), `${lat}`).toBe(false)
  })

  it('mixes them on the Mediterranean', () => {
    // Monaco, 43.7N — the city that prompted this: conifers there read as wrong,
    // but so would nothing but palms.
    const monaco = names(43.73)
    expect(monaco).toContain('palm')
    expect(monaco.some((n) => n !== 'palm')).toBe(true)
  })

  it('treats the southern hemisphere the same', () => {
    expect(hasPalm(-23.5)).toBe(true) // Rio
    expect(hasPalm(-54.8)).toBe(false) // Ushuaia
  })

  it('always offers something to plant', () => {
    for (let lat = -90; lat <= 90; lat += 3) expect(variantsFor(lat).length).toBeGreaterThan(0)
  })

  it('gives palms their own tall trunk, and leaves the others sharing one', () => {
    const palm = variantsFor(10).find((v) => v.name === 'palm')!
    expect(palm.trunk, 'a palm on a stubby 2m trunk is a shrub').toBeDefined()
    const conifer = variantsFor(60).find((v) => v.name === 'conifer')!
    expect(conifer.trunk).toBeUndefined()
  })
})

describe('collectForestSpots', () => {
  it('plants every tree inside the wooded polygon', () => {
    const ring = square(120) // 14,400 m²
    const spots = collectForestSpots([ring], testRng(1))
    expect(spots.length).toBeGreaterThan(0)
    for (const s of spots) expect(pointInPolygon(s.x, s.z, ring), `${s.x},${s.z}`).toBe(true)
  })

  it('fills densely — far more than a park would scatter', () => {
    // A 300×300 wood (90,000 m²). The park scatter caps at 60 per polygon; the
    // forest fill is meant to be a whole order denser (a ~9m grid → ~1000 here).
    const spots = collectForestSpots([square(300)], testRng(2))
    expect(spots.length).toBeGreaterThan(800)
  })

  it('stays under the global cap for an enormous tract', () => {
    // 3km × 3km = 9,000,000 m² — a naive 9m grid would be ~110,000 trees.
    const spots = collectForestSpots([square(3000)], testRng(3))
    expect(spots.length).toBeLessThanOrEqual(FOREST_TREE_CAP)
  })

  it('is deterministic for a given seed', () => {
    const a = collectForestSpots([square(200)], testRng(4))
    const b = collectForestSpots([square(200)], testRng(4))
    expect(a.length).toBe(b.length)
    expect(a[0]).toEqual(b[0])
  })

  it('does nothing without woods', () => {
    expect(collectForestSpots([], testRng(5))).toEqual([])
  })
})

describe('buildGreenery perches', () => {
  /** Every instanced-mesh world position under `object`, crowns and trunks alike. */
  function renderedPositions(object: THREE.Object3D): THREE.Vector3[] {
    const out: THREE.Vector3[] = []
    const m = new THREE.Matrix4()
    object.traverse((o) => {
      const im = o as THREE.InstancedMesh
      if (!im.isInstancedMesh) return
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m)
        out.push(new THREE.Vector3().setFromMatrixPosition(m))
      }
    })
    return out
  }

  it('hands back one perch per tree, seated on that tree\'s own rendered crown', () => {
    // A flat ground and a handful of explicit trees, no scatter: a small, known
    // world where every perch must line up with a crown that was actually drawn.
    const provider = { heightAt: () => 0 }
    const trees: Vec2[] = [
      { x: 10, z: 0 },
      { x: 0, z: 10 },
      { x: -10, z: 0 },
      { x: 0, z: -10 },
      { x: 15, z: 15 },
    ]
    // Northern latitude → conifer/broadleaf/spruce, all with a folY well above the
    // stubby trunk, so a crown height is unmistakably not a trunk height.
    const { object, perches } = buildGreenery([], trees, provider, 60)
    expect(perches.length, 'no perches came back for a green full of trees').toBe(trees.length)

    const rendered = renderedPositions(object)
    for (const perch of perches) {
      // Each perch sits exactly on a rendered instance sharing its (x, z) AND its
      // y — which can only be the foliage crown, since a trunk at the same (x, z)
      // rides at y+s (< 1.5m), never at the crown's folY*s (>= 2.5m). Proof the
      // perch height is the very one the tree was drawn at, not a fixed guess.
      const onCrown = rendered.some(
        (r) =>
          Math.abs(r.x - perch.x) < 1e-4 && Math.abs(r.z - perch.z) < 1e-4 && Math.abs(r.y - perch.y) < 1e-4,
      )
      expect(onCrown, `perch (${perch.x},${perch.z},${perch.y}) is on no rendered crown`).toBe(true)
      // ...and it is genuinely up in a crown, clear of the ground and the trunk top.
      expect(perch.y, 'a perch that low is sitting on the trunk, not in the crown').toBeGreaterThan(2)
    }
  })

  it('reproduces the same perches on a reload — deterministic by construction', () => {
    const provider = { heightAt: () => 0 }
    const green = [square(120)]
    const trees: Vec2[] = [{ x: 30, z: 30 }, { x: 70, z: 40 }]
    const a = buildGreenery(green, trees, provider, 45)
    const b = buildGreenery(green, trees, provider, 45)
    expect(a.perches).toEqual(b.perches)
    expect(a.perches.length).toBeGreaterThan(0)
  })
})

describe('a palm crown', () => {
  /** Every point of the crown, in polar terms, ignoring the solid middle. */
  function spokes(g: THREE.BufferGeometry, radius: number): number[] {
    const pos = g.getAttribute('position')
    const out: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      if (Math.hypot(x, z) < radius * 0.5) continue // near the trunk everything is solid
      out.push(Math.atan2(z, x))
    }
    return out
  }

  /** How far the crown strays from the nearest of `n` evenly spaced fronds, in radians. */
  function offSpoke(g: THREE.BufferGeometry, radius: number, n: number): number {
    const step = (Math.PI * 2) / n
    let worst = 0
    for (const a of spokes(g, radius)) {
      const off = Math.abs(a - Math.round(a / step) * step)
      worst = Math.max(worst, off)
    }
    return worst
  }

  it('is separate fronds with sky between them, not a ball', () => {
    // It was an icosahedron squashed to a third of its height: a round tree that
    // had been sat on, and it read as an ordinary tree in Cairo. The test that
    // matters is that the crown lies along its leaves and nowhere else — sky in
    // between is exactly what a ball has not got.
    // Subdivided, so the control has vertices in every direction rather than the
    // twelve an icosahedron happens to have — the shape is what is on trial here.
    const ball = new THREE.IcosahedronGeometry(2.3, 2)
    ball.scale(1, 0.34, 1)
    expect(offSpoke(frondGeo(2.3), 2.3, 8)).toBeLessThan(0.25)
    expect(offSpoke(ball, 2.3, 8), 'a ball fills every direction').toBeGreaterThan(0.25)
  })

  it('reaches out as far as it is asked to', () => {
    const g = frondGeo(2.3)
    g.computeBoundingBox()
    const box = g.boundingBox!
    expect(Math.max(box.max.x, box.max.z)).toBeGreaterThan(2.3 * 0.7)
  })

  it('droops: the frond tips hang below where they spring from', () => {
    const g = frondGeo(2.3)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.y).toBeLessThan(-0.2)
  })
})
