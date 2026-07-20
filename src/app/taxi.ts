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

/** A pickup / drop-off spot: a road vertex, with the street it sits on. */
interface Spot {
  x: number
  z: number
  name?: string
}

export interface TaxiState {
  active: boolean
  phase: TaxiPhase
  /** The street the current marker is on (OSM road name), or '' if unknown. */
  targetName: string
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
  reset(roads: Road[], provider: ElevationProvider, car: { x: number; z: number }, bound?: number): void
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
function pickSpot(spots: Spot[], from: Vec2, rand: () => number): Spot | null {
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
  let spots: Spot[] = []

  let phase: TaxiPhase = 'toPickup'
  let pickup: Spot | null = null
  let dropoff: Spot | null = null
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

  // A little person at the pickup, waving you over; a cheering one at the drop-off.
  const figMat = (c: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, flatShading: true })
  function makePerson(cheer: boolean): { group: THREE.Group; arm: THREE.Mesh } {
    const g = new THREE.Group()
    const shirt = figMat(cheer ? 0xe86a2a : 0x3a6ea5)
    const skin = figMat(0xd0a878)
    const pants = figMat(0x394049)
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      b.position.set(x, y, z)
      return b
    }
    g.add(mk(0.4, 0.8, 0.26, 0, 0.4, 0, pants), mk(0.46, 0.6, 0.28, 0, 1.05, 0, shirt), mk(0.28, 0.28, 0.28, 0, 1.5, 0, skin))
    const upArm = (): THREE.BufferGeometry => {
      const a = new THREE.BoxGeometry(0.12, 0.5, 0.12)
      a.translate(0, 0.25, 0) // pivot at the shoulder end so it swings from there
      return a
    }
    if (cheer) {
      const la = new THREE.Mesh(upArm(), shirt)
      la.position.set(-0.3, 1.3, 0)
      la.rotation.z = 0.6
      const ra = new THREE.Mesh(upArm(), shirt)
      ra.position.set(0.3, 1.3, 0)
      ra.rotation.z = -0.6
      g.add(la, ra) // both arms up — hooray
      g.frustumCulled = false
      return { group: g, arm: ra }
    }
    g.add(mk(0.12, 0.5, 0.12, -0.3, 1.05, 0, shirt)) // left arm hangs
    const arm = new THREE.Mesh(upArm(), shirt)
    arm.position.set(0.3, 1.3, 0) // right arm raised, waving
    g.add(arm)
    g.frustumCulled = false
    return { group: g, arm }
  }
  const waver = makePerson(false)
  const celebrant = makePerson(true)
  celebrant.group.visible = false
  group.add(waver.group, celebrant.group)
  let time = 0
  let celebrateT = 0
  let celebrantY = 0

  const placeBeam = (spot: Vec2, kind: 'pick' | 'drop'): void => {
    const s = kind === 'pick' ? PICK : DROP
    mat.color.setHex(s.color)
    mat.emissive.setHex(s.emissive)
    const gy = provider.heightAt(spot.x, spot.z)
    beam.position.set(spot.x, gy + BEAM_H / 2, spot.z)
    if (kind === 'pick') {
      // beside the pillar, not inside it — the translucent beam would tint them green.
      waver.group.position.set(spot.x + 2, gy, spot.z)
      waver.group.visible = true
    } else {
      waver.group.visible = false // passenger's aboard now
    }
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
    targetName: ((phase === 'toPickup' ? pickup?.name : dropoff?.name) ?? '').trim(),
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
    reset(roads, prov, car, bound = Infinity) {
      provider = prov
      // On-map spots only: some OSM roads run past the ±RADIUS ground, and a fare
      // out there is a pickup you can never reach (you brake at the world edge first).
      // `bound` is a drivable half-extent, kept inside that edge.
      spots = roads
        .filter((r) => r.kind !== 'path')
        .flatMap((r) => r.points.map((p) => ({ x: p.x, z: p.z, name: r.name })))
        .filter((p) => Math.abs(p.x) <= bound && Math.abs(p.z) <= bound)
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
          celebrantY = provider.heightAt(dropoff.x, dropoff.z)
          celebrant.group.position.set(dropoff.x + 2, celebrantY, dropoff.z) // beside the pillar

          celebrant.group.visible = true // the delivered passenger, cheering
          celebrateT = 2.2
          newFare({ x: carX, z: carZ })
        }
      } else if (timeLeft <= 0) {
        // Meter ran out — the fare's lost, but the shift goes on from here.
        justFailed = true
        newFare({ x: carX, z: carZ })
      }
      // Animate: the waver waves, the celebrant bounces for a couple of seconds.
      time += dt
      if (waver.group.visible) waver.arm.rotation.z = Math.sin(time * 9) * 0.5
      if (celebrateT > 0) {
        celebrateT -= dt
        celebrant.group.position.y = celebrantY + Math.abs(Math.sin(time * 8)) * 0.28
        if (celebrateT <= 0) celebrant.group.visible = false
      }
      return snapshot()
    },
    state: snapshot,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mm = m.material
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
      })
      scene.remove(group)
    },
  }
}
