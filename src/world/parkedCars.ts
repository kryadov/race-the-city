import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { bayLines, ringAngle } from './parking'

// A living car park has cars in it. This scatters low-poly parked cars into the
// bays that parking.ts already marks out — the same grid, so a car sits square
// in its space — then leaves gaps and jitters the rows so it reads as a real lot
// rather than a showroom. Static build-time geometry: parked cars don't drive,
// so there's nothing to update per frame.

export const PARKED_CAR_CAP = 320 // a few hundred cars across the whole map, no more
export const PER_LOT_CAP = 40 // and no single retail park swallows the budget
const FILL = 0.62 // chance a bay is taken — the rest stay empty, as lots are
const YAW_JITTER = 0.1 // radians of wonkiness, so the rows aren't ruler-straight

// A parked car is a coloured body box with a darker cabin box for a roof — two
// instanced draws for the whole map. Dimensions sit inside a 2.5 × 5m bay.
const CAR_W = 1.9
const CAR_H = 0.85
const CAR_L = 4.4
export const BODY_Y = 0.5 // body centre above the tarmac (clears the imagined wheels)
const CABIN_W = 1.6
const CABIN_H = 0.6
const CABIN_L = 2.2
const CABIN_Y = 1.05 // cabin centre, stacked on the body

// Colours a real car park is full of: silver, white, black and grey, with the
// odd red or blue or green. Chosen per car via the instanced colour buffer.
const PALETTE = [
  0x2c3e50, 0xb0b6bd, 0xe8eef2, 0x1c1f26, 0x8a1c1c,
  0x27496d, 0x3a5a40, 0xd9b23a, 0x7a7f87, 0xcdd3d8,
]

const SEED = 0x7a1c0c2b // fixed seed → the same cars park on every browser and reload

/** Deterministic PRNG (mulberry32) — same idea as greenery.ts, so a lot's cars
 * are identical across loads instead of Math.random reshuffling them each time. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ParkedCar {
  x: number
  z: number
  /** Yaw square to the lot's longest edge, plus a touch of jitter. */
  angle: number
  /** Index into PALETTE — the body colour. */
  tint: number
}

/**
 * Pick which bays get a car. Walks the same bay grid the paint uses, drops a car
 * into each with probability FILL, and stops at the per-lot and map-wide caps.
 * Bays already sit inside their polygon (bayLines rejects any that don't), so a
 * placed car is inside by construction.
 */
export function collectParkedCars(parking: Vec2[][], rand: () => number): ParkedCar[] {
  const cars: ParkedCar[] = []
  for (const ring of parking) {
    if (cars.length >= PARKED_CAR_CAP || ring.length < 3) continue
    const angle = ringAngle(ring)
    let inLot = 0
    for (const bay of bayLines(ring)) {
      if (cars.length >= PARKED_CAR_CAP || inLot >= PER_LOT_CAP) break
      if (rand() >= FILL) continue // an empty space
      inLot++
      cars.push({
        x: bay.x,
        z: bay.z,
        angle: angle + (rand() - 0.5) * 2 * YAW_JITTER,
        tint: Math.floor(rand() * PALETTE.length),
      })
    }
  }
  return cars
}

/**
 * Parked cars for the whole map: one instanced body draw and one instanced cabin
 * draw, built once. Each car sits in a marked bay, draped onto the terrain and
 * turned to face down its space, with a per-instance body colour.
 */
export function buildParkedCars(
  parking: Vec2[][],
  provider: ElevationProvider,
  rand: () => number = makeRng(SEED),
): THREE.Object3D {
  const group = new THREE.Group()
  const cars = collectParkedCars(parking, rand)
  if (!cars.length) return group

  const body = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L),
    new THREE.MeshStandardMaterial({ flatShading: true }), // white base, tinted per instance
    cars.length,
  )
  const cabin = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CABIN_W, CABIN_H, CABIN_L),
    new THREE.MeshStandardMaterial({ color: 0x1b1f27, flatShading: true }), // dark glass roof
    cars.length,
  )

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()
  cars.forEach((car, i) => {
    const y = provider.heightAt(car.x, car.z)
    // Car length runs along the box's local z, and -angle turns z to lie along the
    // bay's depth — exactly the turn parking.ts gives its bay dividers.
    q.setFromAxisAngle(up, -car.angle)
    p.set(car.x, y + BODY_Y, car.z)
    body.setMatrixAt(i, m.compose(p, q, one))
    body.setColorAt(i, col.setHex(PALETTE[car.tint]))
    p.set(car.x, y + CABIN_Y, car.z)
    cabin.setMatrixAt(i, m.compose(p, q, one))
  })
  body.instanceMatrix.needsUpdate = true
  if (body.instanceColor) body.instanceColor.needsUpdate = true
  cabin.instanceMatrix.needsUpdate = true
  group.add(body, cabin)
  return group
}
