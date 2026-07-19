import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildParkedCars, collectParkedCars, PARKED_CAR_CAP, PER_LOT_CAP, BODY_Y,
} from '../../src/world/parkedCars'
import { bayLines } from '../../src/world/parking'
import { pointInPolygon } from '../../src/physics/collide'
import type { Vec2 } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

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

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 40 x 20 car park, long side along x. */
const lot: Vec2[] = [v(0, 0), v(40, 0), v(40, 20), v(0, 20)]
/** A square lot `size` metres on a side, cornered at (ox, oz). */
const square = (size: number, ox = 0, oz = 0): Vec2[] =>
  [v(ox, oz), v(ox + size, oz), v(ox + size, oz + size), v(ox, oz + size)]

const flat: ElevationProvider = { heightAt: () => 0 }

describe('collectParkedCars', () => {
  it('parks every car inside the lot', () => {
    const cars = collectParkedCars([lot], testRng(1))
    expect(cars.length).toBeGreaterThan(0)
    for (const c of cars) expect(pointInPolygon(c.x, c.z, lot), `${c.x},${c.z}`).toBe(true)
  })

  it('never parks outside the tarmac', () => {
    // an L-shape: the bounding box covers ground the lot does not
    const L: Vec2[] = [v(0, 0), v(40, 0), v(40, 10), v(10, 10), v(10, 30), v(0, 30)]
    for (const c of collectParkedCars([L], testRng(2))) {
      expect(pointInPolygon(c.x, c.z, L)).toBe(true)
    }
  })

  it('leaves gaps rather than filling every bay', () => {
    const bays = bayLines(lot).length
    const cars = collectParkedCars([lot], testRng(3)).length
    expect(cars).toBeGreaterThan(0)
    expect(cars).toBeLessThan(bays)
  })

  it('respects the per-lot cap on a huge lot', () => {
    const huge = square(600)
    expect(collectParkedCars([huge], testRng(4)).length).toBeLessThanOrEqual(PER_LOT_CAP)
  })

  it('respects the map-wide cap across many lots', () => {
    // 12 big lots, each good for the per-lot cap → far past the global budget
    const lots = Array.from({ length: 12 }, (_, i) => square(200, i * 250, 0))
    expect(collectParkedCars(lots, testRng(5)).length).toBeLessThanOrEqual(PARKED_CAR_CAP)
  })

  it('is deterministic for a given seed', () => {
    const a = collectParkedCars([lot], testRng(6))
    const b = collectParkedCars([lot], testRng(6))
    expect(a.length).toBe(b.length)
    expect(a[0]).toEqual(b[0])
  })

  it('parks nothing without a lot', () => {
    expect(collectParkedCars([], testRng(7))).toEqual([])
  })
})

describe('buildParkedCars', () => {
  it('drapes every car onto the terrain', () => {
    // a slope in x: each car's height must track the ground under it, not sit flat
    const sloped: ElevationProvider = { heightAt: (x) => x * 0.05 }
    const group = buildParkedCars([lot], sloped, testRng(8))
    const body = group.children[0] as THREE.InstancedMesh
    expect(body.count).toBeGreaterThan(0)
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const rot = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      m.decompose(pos, rot, scl)
      expect(pos.y).toBeCloseTo(sloped.heightAt(pos.x, pos.z) + BODY_Y, 5)
    }
  })

  it('paints the cars more than one colour', () => {
    const group = buildParkedCars([square(80)], flat, testRng(9))
    const body = group.children[0] as THREE.InstancedMesh
    expect(body.instanceColor).not.toBeNull()
    const c = new THREE.Color()
    const seen = new Set<number>()
    for (let i = 0; i < body.count; i++) {
      body.getColorAt(i, c)
      seen.add(c.getHex())
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('builds a body and a cabin draw, capped map-wide', () => {
    const lots = Array.from({ length: 12 }, (_, i) => square(200, i * 250, 0))
    const group = buildParkedCars(lots, flat, testRng(10))
    const [body, cabin] = group.children as THREE.InstancedMesh[]
    expect(body.count).toBeLessThanOrEqual(PARKED_CAR_CAP)
    expect(cabin.count).toBe(body.count) // one roof per body
  })

  it('is an empty group with no parking', () => {
    const group = buildParkedCars([], flat, testRng(11))
    expect(group.children.length).toBe(0)
  })
})
