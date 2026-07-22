import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildParkedCars, collectParkedCars, parkedCarColliders, PARKED_CAR_CAP, PER_LOT_CAP, BODY_Y, PARKED_CAR_TOP,
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

/** Instanced-mesh children in build order: body, cabin, wheels, head, tail. */
function parts(group: THREE.Object3D): THREE.InstancedMesh[] {
  return group.children as THREE.InstancedMesh[]
}
/** A geometry's y-extent, computing the bounding box on demand. */
function yRange(geo: THREE.BufferGeometry): { min: number; max: number } {
  geo.computeBoundingBox()
  const box = geo.boundingBox as THREE.Box3
  return { min: box.min.y, max: box.max.y }
}

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

  it('leaves plenty of gaps rather than filling every bay', () => {
    const bays = bayLines(lot).length
    const cars = collectParkedCars([lot], testRng(3)).length
    expect(cars).toBeGreaterThan(0)
    // A partly-empty lot: well under half the bays taken, not bumper-to-bumper.
    expect(cars).toBeLessThan(bays / 2)
  })

  it('scatters cars across the lot rather than along one edge', () => {
    // The lot is 20m deep, so bayLines lays several rows. A car park that reads
    // right has cars in more than one of them — not all bunched on the front rank.
    const cars = collectParkedCars([lot], testRng(3))
    expect(cars.length).toBeGreaterThan(0)
    const depths = new Set(cars.map((c) => Math.round(c.z)))
    expect(depths.size).toBeGreaterThan(1)
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

describe('parkedCarColliders', () => {
  const cars = [
    { x: 10, z: 20, angle: 0, tint: 0 },
    { x: -30, z: 5, angle: Math.PI / 3, tint: 1 },
  ]

  it('makes one solid box per parked car, each around its own car', () => {
    const { footprints, tops } = parkedCarColliders(cars)
    expect(footprints.length).toBe(cars.length)
    expect(tops.length).toBe(cars.length)
    for (let i = 0; i < cars.length; i++) {
      expect(footprints[i].length).toBe(4) // a rectangle
      expect(pointInPolygon(cars[i].x, cars[i].z, footprints[i])).toBe(true) // the car sits inside its box
      expect(tops[i]).toBe(PARKED_CAR_TOP) // height-gated so a jump clears it
    }
  })

  it('sizes the box to the car — a point a whole car-length away is outside it', () => {
    const [box] = parkedCarColliders([{ x: 0, z: 0, angle: 0, tint: 0 }]).footprints
    expect(pointInPolygon(0, 0, box)).toBe(true)
    expect(pointInPolygon(10, 0, box)).toBe(false) // 10m off, well clear of a 4.4m car
    expect(pointInPolygon(0, 10, box)).toBe(false)
  })

  it('is empty for no cars', () => {
    expect(parkedCarColliders([]).footprints).toEqual([])
  })
})

describe('buildParkedCars', () => {
  it('drapes every car onto the terrain', () => {
    // a slope in x: each car's origin (the tyre contact patch) must track the
    // ground under it, not sit flat — every part shares that one matrix
    const sloped: ElevationProvider = { heightAt: (x) => x * 0.05 }
    const group = buildParkedCars([lot], sloped, testRng(8))
    const [body] = parts(group)
    expect(body.count).toBeGreaterThan(0)
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const rot = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      m.decompose(pos, rot, scl)
      expect(pos.y).toBeCloseTo(sloped.heightAt(pos.x, pos.z), 5)
    }
  })

  it('rests the wheels on the tarmac with the body riding above them', () => {
    // The old bug was a body sunk into the road. Now the wheels reach the ground
    // (y = 0 in the car's local frame) and the body floats clear of it, centred
    // at BODY_Y — so no part dips below the surface the car is draped onto.
    const group = buildParkedCars([lot], flat, testRng(8))
    const [body, , wheels] = parts(group)
    const wheelY = yRange(wheels.geometry)
    expect(wheelY.min).toBeCloseTo(0, 5) // tyres touch the tarmac
    const bodyY = yRange(body.geometry)
    expect(bodyY.min).toBeGreaterThan(0) // body underside clears the road
    expect((bodyY.min + bodyY.max) / 2).toBeCloseTo(BODY_Y, 5) // centred at BODY_Y
    expect(bodyY.min).toBeGreaterThan(wheelY.min) // and it sits up on the wheels
  })

  it('gives head and tail lamps distinct colours', () => {
    const group = buildParkedCars([lot], flat, testRng(8))
    const [, , , head, tail] = parts(group)
    const headHex = (head.material as THREE.MeshStandardMaterial).color.getHex()
    const tailHex = (tail.material as THREE.MeshStandardMaterial).color.getHex()
    expect(headHex).not.toBe(tailHex) // a pale front pair, a red rear pair
    // the tail is a warm red: more red channel than blue
    const tailCol = (tail.material as THREE.MeshStandardMaterial).color
    expect(tailCol.r).toBeGreaterThan(tailCol.b)
  })

  it('paints the cars more than one colour', () => {
    const group = buildParkedCars([square(80)], flat, testRng(9))
    const [body] = parts(group)
    expect(body.instanceColor).not.toBeNull()
    const c = new THREE.Color()
    const seen = new Set<number>()
    for (let i = 0; i < body.count; i++) {
      body.getColorAt(i, c)
      seen.add(c.getHex())
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('builds body, cabin, wheels and two lamp draws, one instance per car, capped map-wide', () => {
    const lots = Array.from({ length: 12 }, (_, i) => square(200, i * 250, 0))
    const group = buildParkedCars(lots, flat, testRng(10))
    const meshes = parts(group)
    expect(meshes.length).toBe(5) // body, cabin, wheels, headlamps, taillamps
    for (const mesh of meshes) {
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
      expect(mesh.count).toBe(meshes[0].count) // one instance of every part per car
      expect(mesh.count).toBeLessThanOrEqual(PARKED_CAR_CAP)
    }
    expect(meshes[0].count).toBeGreaterThan(0)
  })

  it('is an empty group with no parking', () => {
    const group = buildParkedCars([], flat, testRng(11))
    expect(group.children.length).toBe(0)
  })
})
