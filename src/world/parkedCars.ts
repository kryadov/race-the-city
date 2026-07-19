import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { bayLines, ringAngle } from './parking'

// A living car park has cars in it. This scatters low-poly parked cars into the
// bays that parking.ts already marks out — the same grid, so a car sits square
// in its space — then leaves gaps and jitters the rows so it reads as a real lot
// rather than a showroom. Static build-time geometry: parked cars don't drive,
// so there's nothing to update per frame.

export const PARKED_CAR_CAP = 280 // a few hundred cars across the whole map, no more
export const PER_LOT_CAP = 30 // and no single retail park swallows the budget
const FILL = 0.4 // chance a bay is taken — most stay empty, so a lot reads partly full
const YAW_JITTER = 0.1 // radians of wonkiness, so the rows aren't ruler-straight

// A parked car is authored ONCE in its own local frame with y = 0 at the tyres'
// contact patch: a coloured body box, a darker cabin for glass, four wheels and
// four lamp dabs. Every part bakes its offset into its geometry, so one instance
// matrix per car places and turns the whole thing as a unit. Dimensions sit
// inside a 2.5 × 5m bay.
const CAR_W = 1.9
const CAR_H = 0.7 // a touch lower than before now the body rides on real wheels
const CAR_L = 4.4
// Body centre above the tarmac. It has to clear the wheels: with 0.33m wheels the
// old 0.5 buried the sills, so the car read as a box sunk in the road. At 0.66 the
// body's underside sits at ~0.31m and a good band of tyre shows beneath it.
export const BODY_Y = 0.66
const CABIN_W = 1.6
const CABIN_H = 0.5
const CABIN_L = 2.2
const CABIN_Y = 1.16 // cabin centre, nested on top of the body

const WHEEL_R = 0.33 // low, fat wheel — reads at a glance without being an SUV
const WHEEL_W = 0.22
const HALF_TRACK = CAR_W / 2 - WHEEL_W / 2 // wheels tucked flush with the body sides
const HALF_BASE = 1.3 // front/rear axles, ~0.9m of overhang at each end

const LAMP_W = 0.3
const LAMP_H = 0.16
const LAMP_D = 0.08
const LAMP_Y = 0.6 // low on the nose/tail, within the body band
const HALF_LAMP = CAR_W / 2 - 0.35 // inset from the corners

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
 * Pick which bays get a car. Walks the same bay grid the paint uses — which
 * already runs across every row of the lot, not just its kerb — and drops a car
 * into each with probability FILL, stopping at the per-lot and map-wide caps. The
 * low FILL means acceptance is thin and even across all the rows the walk visits,
 * so cars end up scattered over the lot rather than packed along the first rank.
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

/** The four wheels as one geometry: low cylinders barrelled along x (the car's
 * width, the axle they turn about) and dropped at each corner, tyre bottoms at
 * y = 0 so the whole car rests square on the tarmac. */
function wheelsGeometry(): THREE.BufferGeometry {
  const wheels: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // 12 sides, not 10: a multiple of four puts a vertex at bottom-dead-centre,
      // so the tyre's lowest point is exactly WHEEL_R below its axle and rests flat
      // on the tarmac instead of floating on the flat between two facets.
      const w = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12)
      w.rotateZ(Math.PI / 2) // Y-axis barrel → X-axis, so it rolls the right way
      w.translate(sx * HALF_TRACK, WHEEL_R, sz * HALF_BASE)
      wheels.push(w)
    }
  }
  return mergeGeometries(wheels)
}

/** A pair of lamp dabs at one end (front or rear), merged into one geometry. Kept
 * as its own mesh per colour — a uniform pale front, a uniform red rear — because
 * an InstancedMesh already carries a per-car body tint on instanceColor, and
 * mixing that with a vertex-colour attribute paints every instance black (see
 * AGENTS.md). Two flat-shaded materials sidestep the whole trap. */
function lampsGeometry(zEnd: number): THREE.BufferGeometry {
  const dabs: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const d = new THREE.BoxGeometry(LAMP_W, LAMP_H, LAMP_D)
    d.translate(sx * HALF_LAMP, LAMP_Y, zEnd)
    dabs.push(d)
  }
  return mergeGeometries(dabs)
}

/**
 * Parked cars for the whole map: five instanced draws — body, cabin, wheels,
 * headlamps and taillamps — built once, each carrying every car as one instance.
 * Each car sits in a marked bay, draped onto the terrain and turned to face down
 * its space; the body takes a per-instance colour, the rest share flat materials.
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
    new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L).translate(0, BODY_Y, 0),
    new THREE.MeshStandardMaterial({ flatShading: true }), // white base, tinted per instance
    cars.length,
  )
  const cabin = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CABIN_W, CABIN_H, CABIN_L).translate(0, CABIN_Y, 0),
    new THREE.MeshStandardMaterial({ color: 0x14171f, flatShading: true }), // dark glass roof
    cars.length,
  )
  const wheels = new THREE.InstancedMesh(
    wheelsGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x111114, flatShading: true }), // near-black tyre
    cars.length,
  )
  const headlamps = new THREE.InstancedMesh(
    lampsGeometry(CAR_L / 2), // +z is the nose
    new THREE.MeshStandardMaterial({ color: 0xf3eccf, flatShading: true }), // pale front pair
    cars.length,
  )
  const taillamps = new THREE.InstancedMesh(
    lampsGeometry(-CAR_L / 2), // -z is the tail
    new THREE.MeshStandardMaterial({ color: 0x8e1a12, flatShading: true }), // red rear pair
    cars.length,
  )

  const parts = [body, cabin, wheels, headlamps, taillamps]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()
  cars.forEach((car, i) => {
    // The whole car is authored with y = 0 at the tyres, so a single matrix drops
    // it onto the ground: origin at the tarmac, -angle turning local z along the
    // bay's depth — exactly the turn parking.ts gives its bay dividers.
    const y = provider.heightAt(car.x, car.z)
    q.setFromAxisAngle(up, -car.angle)
    p.set(car.x, y, car.z)
    m.compose(p, q, one)
    for (const part of parts) part.setMatrixAt(i, m)
    body.setColorAt(i, col.setHex(PALETTE[car.tint]))
  })
  for (const part of parts) part.instanceMatrix.needsUpdate = true
  if (body.instanceColor) body.instanceColor.needsUpdate = true
  group.add(...parts)
  return group
}
