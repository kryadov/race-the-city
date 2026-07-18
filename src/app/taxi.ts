import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** How close to the marker counts as arrived, metres. */
const REACH = 13
/** A fare's pickup and drop-off sit this far apart (and from the car), metres. */
const MIN_DIST = 120
const MAX_DIST = 650
/** Assumed cruising speed the timer is budgeted against, m/s, with slack. */
const BUDGET_SPEED = 11
const TIME_SLACK = 1.7
const MIN_TIME = 22 // no fare ever gives less than this

const BEAM_H = 44 // tall enough to see over the rooftops
const BEAM_R = 1.6

export type TaxiPhase = 'toPickup' | 'toDropoff'

export interface TaxiState {
  active: boolean
  phase: TaxiPhase
  /** Seconds left to reach the current marker. */
  timeLeft: number
  /** Fares delivered on time. */
  fares: number
  /** Running score (a coin count that scales with trip length). */
  earnings: number
  justDelivered: boolean // set for one frame on a delivery
  justFailed: boolean // set for one frame when a fare times out
}

export interface Taxi {
  setEnabled(on: boolean): void
  enabled(): boolean
  /** The current marker, for the minimap. Null when off. */
  target(): Vec2 | null
  reset(roads: Road[], provider: ElevationProvider, car: { x: number; z: number }): void
  update(dt: number, carX: number, carZ: number): TaxiState
  state(): TaxiState
  dispose(): void
}

/** A coin reward that grows with the trip's length. */
export function fareValue(a: Vec2, b: Vec2): number {
  return Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 90))
}

/** Seconds allowed to cover a→b, generous but finite. */
export function timeBudget(a: Vec2, b: Vec2): number {
  return Math.max(MIN_TIME, (Math.hypot(b.x - a.x, b.z - a.z) / BUDGET_SPEED) * TIME_SLACK)
}

/** A drivable spot [min,max] metres from `from`; falls back to any spot. */
function pickSpot(spots: Vec2[], from: Vec2, rand: () => number): Vec2 | null {
  if (!spots.length) return null
  for (let i = 0; i < 50; i++) {
    const p = spots[Math.floor(rand() * spots.length)]
    const d = Math.hypot(p.x - from.x, p.z - from.z)
    if (d >= MIN_DIST && d <= MAX_DIST) return p
  }
  return spots[Math.floor(rand() * spots.length)] ?? null
}

/**
 * Taxi mode: pick a passenger up at the marker, deliver them to the next marker
 * before the meter runs out, then straight on to the next fare — a shift that
 * chains, the score climbing with every drop-off. Markers are road vertices, so
 * every fare is somewhere you can actually drive.
 */
export function createTaxi(scene: THREE.Scene, rand: () => number = Math.random): Taxi {
  const group = new THREE.Group()
  scene.add(group)
  let on = false
  let provider: ElevationProvider = { heightAt: () => 0 }
  let spots: Vec2[] = []

  let phase: TaxiPhase = 'toPickup'
  let pickup: Vec2 | null = null
  let dropoff: Vec2 | null = null
  let timeLeft = 0
  let fares = 0
  let earnings = 0
  let justDelivered = false
  let justFailed = false

  // A glowing pillar of light at the marker: green to pick up, amber to deliver.
  const PICK = { color: 0x134e2c, emissive: 0x39e07a }
  const DROP = { color: 0x5a3a10, emissive: 0xffb020 }
  const mat = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.55,
    emissiveIntensity: 1.3,
    flatShading: true,
    depthWrite: false,
    fog: false,
  })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R, BEAM_R, BEAM_H, 8, 1, true), mat)
  beam.frustumCulled = false
  group.add(beam)

  const placeBeam = (spot: Vec2, kind: 'pick' | 'drop'): void => {
    const s = kind === 'pick' ? PICK : DROP
    mat.color.setHex(s.color)
    mat.emissive.setHex(s.emissive)
    beam.position.set(spot.x, provider.heightAt(spot.x, spot.z) + BEAM_H / 2, spot.z)
  }

  /** Start a fresh fare: a passenger to pick up, from wherever the car is now. */
  const newFare = (from: Vec2): void => {
    pickup = pickSpot(spots, from, rand)
    dropoff = null
    phase = 'toPickup'
    timeLeft = pickup ? timeBudget(from, pickup) : 0
    if (pickup) placeBeam(pickup, 'pick')
  }

  const snapshot = (): TaxiState => ({
    active: on,
    phase,
    timeLeft: Math.max(0, timeLeft),
    fares,
    earnings,
    justDelivered,
    justFailed,
  })

  return {
    enabled: () => on,
    target: () => (on ? (phase === 'toPickup' ? pickup : dropoff) : null),
    setEnabled(v) {
      on = v
      group.visible = v
    },
    reset(roads, prov, car) {
      provider = prov
      spots = roads.filter((r) => r.kind !== 'path').flatMap((r) => r.points)
      fares = 0
      earnings = 0
      justDelivered = false
      justFailed = false
      newFare(car)
    },
    update(dt, carX, carZ) {
      justDelivered = false
      justFailed = false
      if (!on || !pickup) return snapshot()
      timeLeft -= dt
      const tgt = phase === 'toPickup' ? pickup : dropoff
      if (tgt && Math.hypot(tgt.x - carX, tgt.z - carZ) < REACH) {
        if (phase === 'toPickup') {
          // Passenger's in: head for the drop-off.
          dropoff = pickSpot(spots, pickup, rand)
          phase = 'toDropoff'
          timeLeft = dropoff ? timeBudget(pickup, dropoff) : 0
          if (dropoff) placeBeam(dropoff, 'drop')
        } else if (dropoff) {
          fares++
          earnings += fareValue(pickup, dropoff)
          justDelivered = true
          newFare({ x: carX, z: carZ })
        }
      } else if (timeLeft <= 0) {
        // Meter ran out — the fare's lost, but the shift goes on from here.
        justFailed = true
        newFare({ x: carX, z: carZ })
      }
      return snapshot()
    },
    state: snapshot,
    dispose() {
      beam.geometry.dispose()
      mat.dispose()
      scene.remove(group)
    },
  }
}
