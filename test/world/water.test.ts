import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { waterLevel, buildWater, waterBarriers } from '../../src/world/water'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z }) as Vec2

/** The one railing mesh in a water group, found by its metal-grey material. */
const railingMesh = (obj: THREE.Object3D): THREE.Mesh | undefined => {
  let found: THREE.Mesh | undefined
  obj.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if ((o as THREE.Mesh).isMesh && mat && !Array.isArray(mat) && mat.color?.getHex() === 0x77797d) {
      found = o as THREE.Mesh
    }
  })
  return found
}

/** Total XZ area of the water SURFACE (the flat blue fill), summed over its triangles. */
const surfaceArea = (obj: THREE.Object3D): number => {
  let area = 0
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    const mat = m.material as THREE.MeshStandardMaterial | undefined
    if (!m.isMesh || !mat || Array.isArray(mat) || mat.color?.getHex() !== 0x2f6db0) return
    const pos = m.geometry.getAttribute('position')
    const idx = m.geometry.getIndex()
    const tri = (a: number, b: number, c: number): void => {
      const ax = pos.getX(a), az = pos.getZ(a)
      const bx = pos.getX(b), bz = pos.getZ(b)
      const cx = pos.getX(c), cz = pos.getZ(c)
      area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
    }
    if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2))
    else for (let i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2)
  })
  return area
}

describe('buildWater islands', () => {
  const flat = { heightAt: () => 0 }
  const outer = [v(-100, -100), v(100, -100), v(100, 100), v(-100, 100)] // 200×200 = 40000 m²
  const island = [v(-20, -20), v(20, -20), v(20, 20), v(-20, 20)] // 40×40 = 1600 m²

  it('cuts an island (inner ring) out of the water surface', () => {
    const solid = surfaceArea(buildWater([outer], flat))
    const holed = surfaceArea(buildWater([outer], flat, [island]))
    expect(holed).toBeLessThan(solid)
    expect(solid - holed).toBeCloseTo(1600, 0) // exactly the island's area is gone
  })

  it('ignores an island that lies in no body', () => {
    const far = [v(500, 500), v(520, 500), v(520, 520), v(500, 520)]
    const solid = surfaceArea(buildWater([outer], flat))
    expect(surfaceArea(buildWater([outer], flat, [far]))).toBeCloseTo(solid, 0)
  })
})

describe('waterLevel', () => {
  it('sits just above the lowest ground under the outline', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)]
    const provider = { heightAt: (x: number) => (x === 0 ? 5 : 9) }
    expect(waterLevel(ring, provider)).toBeCloseTo(5.2)
  })

  it('does not hang in the air when the centroid lands on a bank', () => {
    // A crescent river: the centroid (~15,15) is dry land 40m up, while the
    // water itself runs along the low outline. Levelling by centroid floated
    // the whole surface over the valley.
    const ring = [v(0, 0), v(30, 0), v(30, 30), v(20, 30), v(20, 10), v(0, 10)]
    const provider = {
      heightAt: (x: number, z: number) => (x > 14 && x < 21 && z > 12 && z < 25 ? 40 : 2),
    }
    const level = waterLevel(ring, provider)
    expect(level).toBeCloseTo(2.2)
    expect(level).toBeLessThan(40)
  })

  it('follows the basin down as the terrain drops', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10)]
    const high = { heightAt: () => 100 }
    const low = { heightAt: () => -3 }
    expect(waterLevel(ring, high)).toBeCloseTo(100.2)
    expect(waterLevel(ring, low)).toBeCloseTo(-2.8)
  })
})

describe('buildWater railing', () => {
  const flat = { heightAt: () => 0 }

  it('rails a sizable body with a single merged mesh', () => {
    const ring = [v(0, 0), v(100, 0), v(100, 100), v(0, 100)] // 400m perimeter
    const rail = railingMesh(buildWater([ring], flat))
    expect(rail).toBeDefined()
    const pos = rail!.geometry.getAttribute('position')
    // Posts + top rail, distance-spaced round the loop: many bars, all in one mesh.
    expect(pos.count).toBeGreaterThan(0)
    // ...and seated on the dry lip, so every vertex stands at or above it.
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeGreaterThanOrEqual(0.5 - 1e-6)
  })

  it('leaves a tiny pond unrailed', () => {
    const pond = [v(0, 0), v(6, 0), v(6, 6), v(0, 6)] // 24m perimeter, under the minimum
    expect(railingMesh(buildWater([pond], flat))).toBeUndefined()
  })
})

describe('waterBarriers', () => {
  const flat = { heightAt: () => 0 }
  // A big square basin, so the coarse bed sampler catches several points inside.
  const basin = [v(-100, -100), v(100, -100), v(100, 100), v(-100, 100)]

  it('walls an embanked shore but leaves open water passable', () => {
    // A bowl tipped east: the west half of the bed sits low and sets the water
    // level, so the east bank stands proud (embanked) while the west bank is
    // drowned (open water). Only the east edge should get a wall.
    const provider = { heightAt: (x: number) => (x >= 0 ? 5 : -5) }
    const { footprints, tops } = waterBarriers([basin], provider)
    expect(footprints.length).toBe(1)
    expect(tops.length).toBe(1)

    const quad = footprints[0]
    expect(quad.length).toBe(4) // a rectangle
    // It hugs the east edge (x≈100), on the BANK side — outside the water body,
    // whose interior reaches only to x=100.
    const cx = quad.reduce((s, p) => s + p.x, 0) / 4
    expect(cx).toBeGreaterThan(100)
    // Thin across the edge, long along it: a wall, not a slab.
    const xs = quad.map((p) => p.x)
    const zs = quad.map((p) => p.z)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1) // a few decimetres
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(200) // spans the edge
    // The wall stands above the BANK it sits on (east bank ground = 5), not the
    // waterline, so a car on a tall quay can't sit over it — grounded car stopped,
    // jump/hover clears. BARRIER_WALL_H = 1.2m over the 5m bank.
    expect(tops[0]).toBeCloseTo(5 + 1.2)
  })

  it('leaves a flush shore unwalled so the car can sink into open water', () => {
    // Ground level with the water everywhere: no bank stands proud, so it is all
    // open water — nothing to wall, and the sinking/bubbles stay reachable.
    expect(waterBarriers([basin], flat)).toEqual({ footprints: [], tops: [] })
  })

  it('walls every side of a body sunk into raised ground', () => {
    // A basin dug into a plateau, low only along a thin cross through the middle
    // that sets the water level; all four banks stand well above it.
    const provider = { heightAt: (x: number, z: number) => (Math.abs(x) < 20 || Math.abs(z) < 20 ? -30 : 40) }
    const { footprints, tops } = waterBarriers([basin], provider)
    expect(footprints.length).toBe(4) // one wall per shore edge
    expect(tops.length).toBe(4)
    for (const quad of footprints) expect(quad.length).toBe(4)
  })

  it('leaves a gap where a road bridges across the shore', () => {
    // Every bank stands proud, so bare walls would ring all four edges. A road
    // runs from the east bank OUT over the water, crossing the east shore edge —
    // that edge is a bridge approach and must be left open, not walled shut. This
    // is the old "invisible wall across the bridge" regression, now fixed.
    const provider = { heightAt: (x: number, z: number) => (Math.abs(x) < 20 || Math.abs(z) < 20 ? -30 : 40) }
    const bridge: Road = { kind: 'residential', points: [v(130, 0), v(60, 0)] } // crosses x=100 edge
    const { footprints } = waterBarriers([basin], provider, [bridge])
    expect(footprints.length).toBe(3) // the east crossing edge is dropped; the other three stand
    // None of the surviving walls sit on the east edge (x≈100) the bridge crosses.
    for (const quad of footprints) {
      const cx = quad.reduce((s, p) => s + p.x, 0) / 4
      expect(cx).toBeLessThan(90) // west, or a wall on a north/south edge — never the bridged east
    }
  })

  it('does NOT gap for a road running parallel along the bank', () => {
    // A riverside road runs ALONGSIDE the east bank (never crossing the shore) —
    // it must not delete the wall, or a whole embankment would open up. Only a
    // genuine crossing gaps it.
    const provider = { heightAt: (x: number) => (x >= 0 ? 5 : -5) }
    const quay: Road = { kind: 'residential', points: [v(110, -80), v(110, 80)] } // parallel, on the bank
    const { footprints } = waterBarriers([basin], provider, [quay])
    expect(footprints.length).toBe(1) // the east wall still stands
  })

  it('a footpath does not gap the wall', () => {
    // You don't drive a car onto a footbridge, so a path crossing keeps its wall
    // (matching the undrivable set elsewhere).
    const provider = { heightAt: (x: number, z: number) => (Math.abs(x) < 20 || Math.abs(z) < 20 ? -30 : 40) }
    const foot: Road = { kind: 'path', points: [v(130, 0), v(60, 0)] }
    const { footprints } = waterBarriers([basin], provider, [foot])
    expect(footprints.length).toBe(4) // all four walls stand
  })

  it('ignores degenerate rings', () => {
    expect(waterBarriers([[v(0, 0), v(1, 1)]], flat)).toEqual({ footprints: [], tops: [] })
  })
})
