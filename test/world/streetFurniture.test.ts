import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildStreetFurniture } from '../../src/world/streetFurniture'
import type { Vec2 } from '../../src/geo/types'

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

describe('buildStreetFurniture', () => {
  it('builds one instanced draw per part, sized to the inputs', () => {
    const g = buildStreetFurniture(grid(24), grid(9), flat, makeRng(1))
    expect(inst(g, 'bench-frame')!.count).toBe(24)
    expect(inst(g, 'bench-slats')!.count).toBe(24)
    expect(inst(g, 'busstop-frame')!.count).toBe(9)
    expect(inst(g, 'busstop-sign')!.count).toBe(9)
  })

  it('builds nothing for an empty city', () => {
    expect(buildStreetFurniture([], [], flat).children).toHaveLength(0)
  })

  it('builds benches without bus stops, and bus stops without benches', () => {
    const benchesOnly = buildStreetFurniture(grid(5), [], flat, makeRng(2))
    expect(inst(benchesOnly, 'bench-frame')!.count).toBe(5)
    expect(inst(benchesOnly, 'busstop-frame')).toBeUndefined()

    const stopsOnly = buildStreetFurniture([], grid(5), flat, makeRng(2))
    expect(inst(stopsOnly, 'busstop-frame')!.count).toBe(5)
    expect(inst(stopsOnly, 'bench-frame')).toBeUndefined()
  })

  it('seats figures on some benches but not all', () => {
    const n = 80
    const g = buildStreetFurniture(grid(n), [], flat, makeRng(7))
    const torso = inst(g, 'figure-torso')!
    expect(torso.count, 'some benches are occupied').toBeGreaterThan(0)
    expect(torso.count, 'and some are left empty').toBeLessThan(n)
    // A seated figure is head + torso + legs — one instanced mesh each, all in step.
    expect(inst(g, 'figure-head')!.count).toBe(torso.count)
    expect(inst(g, 'figure-legs')!.count).toBe(torso.count)
  })

  it('stands everything on the terrain, not floating or sunk', () => {
    const hill = { heightAt: () => 40 }
    const g = buildStreetFurniture(grid(30), grid(9), hill, makeRng(3))
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
    const g = buildStreetFurniture(grid(80), [], hill, makeRng(7))
    const head = inst(g, 'figure-head')
    expect(head, 'at least one bench is occupied').toBeDefined()
    const box = new THREE.Box3().setFromObject(head!)
    expect(box.max.y, 'a seated head is roughly a metre up').toBeGreaterThan(40.8)
  })

  it('is stable for a given rng', () => {
    const a = buildStreetFurniture(grid(30), grid(8), flat, makeRng(9))
    const b = buildStreetFurniture(grid(30), grid(8), flat, makeRng(9))
    expect(inst(b, 'figure-torso')?.count ?? 0).toBe(inst(a, 'figure-torso')?.count ?? 0)
    const boxA = new THREE.Box3().setFromObject(a)
    const boxB = new THREE.Box3().setFromObject(b)
    expect(boxB.min.toArray()).toEqual(boxA.min.toArray())
    expect(boxB.max.toArray()).toEqual(boxA.max.toArray())
  })
})
