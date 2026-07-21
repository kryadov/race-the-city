import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildStreetFurniture } from '../../src/world/streetFurniture'
import { isOverWater } from '../../src/world/waterArea'
import type { Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** Deterministic PRNG (mulberry32) so the empty/occupied mix is stable across
 *  runs — otherwise the "some but not all" assertion would be flaky. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** n well-separated positions on a grid. */
const grid = (n: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => ({ x: (i % 10) * 12, z: Math.floor(i / 10) * 12 }))

const inst = (g: THREE.Object3D, name: string): THREE.InstancedMesh | undefined =>
  g.getObjectByName(name) as THREE.InstancedMesh | undefined

/** A closed axis-aligned rectangle ring covering [x0,x1] × [z0,z1]. */
const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
]

describe('isOverWater', () => {
  const river = [rect(-100, -100, 100, 100)] // one big water body
  const island = [rect(-20, -20, 20, 20)] // an island cut out of it (a water hole)

  it('is true inside a water body', () => {
    expect(isOverWater(50, 50, river, [])).toBe(true)
  })
  it('is false on the bank, outside the water', () => {
    expect(isOverWater(200, 0, river, [])).toBe(false)
  })
  it('is false on an island cut out of the water (a water hole is dry land)', () => {
    // The Île de la Cité case: inside the Seine's outline but on the island.
    expect(isOverWater(0, 0, river, island)).toBe(false)
    // still true just off the island, over open water
    expect(isOverWater(40, 40, river, island)).toBe(true)
  })
  it('is false when there is no water at all', () => {
    expect(isOverWater(0, 0, [], [])).toBe(false)
  })
})

describe('buildStreetFurniture', () => {
  it('drops benches and bus stops that sit out over the water, keeps the rest', () => {
    const water = [rect(0, -50, 100, 50)] // water to the +x side
    const island = [rect(30, -10, 50, 10)] // an island within it
    const benches: Vec2[] = [
      { x: -30, z: 0 }, // dry bank → kept
      { x: 60, z: 0 }, // out over the water → dropped
      { x: 40, z: 0 }, // on the island → kept
    ]
    const g = buildStreetFurniture(benches, [], [], flat, makeRng(1), water, island)
    // 2 of the 3 benches survive (bank + island); the one in the river is gone.
    expect(inst(g, 'bench-frame')!.count).toBe(2)
  })

  it('builds one instanced draw per part, sized to the inputs', () => {
    const g = buildStreetFurniture(grid(24), grid(9), [], flat, makeRng(1))
    expect(inst(g, 'bench-frame')!.count).toBe(24)
    expect(inst(g, 'bench-slats')!.count).toBe(24)
    expect(inst(g, 'busstop-frame')!.count).toBe(9)
    expect(inst(g, 'busstop-sign')!.count).toBe(9)
  })

  it('builds nothing for an empty city', () => {
    expect(buildStreetFurniture([], [], [], flat).children).toHaveLength(0)
  })

  it('builds benches without bus stops, and bus stops without benches', () => {
    const benchesOnly = buildStreetFurniture(grid(5), [], [], flat, makeRng(2))
    expect(inst(benchesOnly, 'bench-frame')!.count).toBe(5)
    expect(inst(benchesOnly, 'busstop-frame')).toBeUndefined()

    const stopsOnly = buildStreetFurniture([], grid(5), [], flat, makeRng(2))
    expect(inst(stopsOnly, 'busstop-frame')!.count).toBe(5)
    expect(inst(stopsOnly, 'bench-frame')).toBeUndefined()
  })

  it('seats figures on some benches but not all', () => {
    const n = 80
    const g = buildStreetFurniture(grid(n), [], [], flat, makeRng(7))
    const torso = inst(g, 'figure-torso')!
    expect(torso.count, 'some benches are occupied').toBeGreaterThan(0)
    expect(torso.count, 'and some are left empty').toBeLessThan(n)
    // A seated figure is head + torso + legs — one instanced mesh each, all in step.
    expect(inst(g, 'figure-head')!.count).toBe(torso.count)
    expect(inst(g, 'figure-legs')!.count).toBe(torso.count)
  })

  it('stands everything on the terrain, not floating or sunk', () => {
    const hill = { heightAt: () => 40 }
    const g = buildStreetFurniture(grid(30), grid(9), [], hill, makeRng(3))
    const box = new THREE.Box3().setFromObject(g)
    // Legs/poles/feet are baked at local y = 0, so the lowest point of the whole
    // batch must sit right on the 40 m ground.
    expect(box.min.y, 'nothing sinks below the ground').toBeGreaterThan(39.5)
    expect(box.min.y, 'and nothing floats above it').toBeLessThan(40.5)
  })

  it('seats the person up on the bench, above the terrain', () => {
    // Same seed/size as the occupancy test above, so figures are present here
    // too. On a 40 m hill the figure's head must be well clear of the ground —
    // i.e. actually sat up on the bench, not standing at its feet.
    const hill = { heightAt: () => 40 }
    const g = buildStreetFurniture(grid(80), [], [], hill, makeRng(7))
    const head = inst(g, 'figure-head')
    expect(head, 'at least one bench is occupied').toBeDefined()
    const box = new THREE.Box3().setFromObject(head!)
    expect(box.max.y, 'a seated head is roughly a metre up').toBeGreaterThan(40.8)
  })

  it('lines a roadside bench up parallel to the road', () => {
    const road: Road = { points: [{ x: 0, z: 0 }, { x: 100, z: 0 }], kind: 'residential' } // runs along +x
    const g = buildStreetFurniture([{ x: 50, z: 3 }], [], [road], flat, makeRng(1)) // bench 3m off it
    const m = new THREE.Matrix4()
    inst(g, 'bench-frame')!.getMatrixAt(0, m)
    const q = new THREE.Quaternion()
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y
    // road angle is 0; a bench lined up with it has yaw ≈ 0 (or ±π — same line)
    expect(Math.abs(Math.sin(yaw)), 'roadside bench is not parallel to the road').toBeLessThan(1e-3)
  })

  it('thins a flood of benches down to a cap', () => {
    const count = inst(buildStreetFurniture(grid(300), [], [], flat, makeRng(1)), 'bench-frame')!.count
    expect(count).toBeLessThanOrEqual(55)
    expect(count).toBeGreaterThan(40)
  })

  it('caps park and street benches apart, so a bench-heavy park cannot starve the street', () => {
    // A single straight street along +x, a park full of benches well off it, and
    // a run of benches lining the kerb. A single combined cap spends itself almost
    // entirely on the park and leaves the street bare — the regression that made
    // street benches vanish. Capping the two groups apart keeps every street one.
    const road: Road = { points: [{ x: 0, z: 0 }, { x: 1000, z: 0 }], kind: 'residential' } // runs along +x
    const street: Vec2[] = Array.from({ length: 12 }, (_, i) => ({ x: 20 + i * 15, z: 4 })) // 4m off the kerb
    const park: Vec2[] = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 6, z: 500 + Math.floor(i / 20) * 6 }))
    const g = buildStreetFurniture([...park, ...street], [], [road], flat, makeRng(1))
    const frame = inst(g, 'bench-frame')!
    expect(frame.count, 'benches are emitted at all').toBeGreaterThan(0)

    // Street benches sit by the road (small |z|); park benches are 500m+ away. So
    // the count near the road is exactly the street benches that survived the cap.
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    let nearStreet = 0
    for (let i = 0; i < frame.count; i++) {
      frame.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      if (Math.abs(pos.z) < 50) nearStreet++
    }
    expect(nearStreet, 'every street bench survives a park-heavy cap').toBe(street.length)
  })

  it('is stable for a given rng', () => {
    const a = buildStreetFurniture(grid(30), grid(8), [], flat, makeRng(9))
    const b = buildStreetFurniture(grid(30), grid(8), [], flat, makeRng(9))
    expect(inst(b, 'figure-torso')?.count ?? 0).toBe(inst(a, 'figure-torso')?.count ?? 0)
    const boxA = new THREE.Box3().setFromObject(a)
    const boxB = new THREE.Box3().setFromObject(b)
    expect(boxB.min.toArray()).toEqual(boxA.min.toArray())
    expect(boxB.max.toArray()).toEqual(boxA.max.toArray())
  })
})
