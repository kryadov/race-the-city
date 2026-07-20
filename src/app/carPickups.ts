import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildVehicleMesh } from '../vehicle/model'
import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'

const COUNT = 5 // pickable cars out on the map at once
const PICK_R = 6 // how close you must drive to swap into one (m) — a car is a big target
const FLOAT_Y = 0.0 // a car sits ON the road, unlike nitro's floating bottle

// The pickups live in a ring around the car, the same scatter every pickup uses:
// spread over the whole 1000m-radius city they fall outside the ~150m you can
// see, so a mode built on finding them would look like there were none to find.
export const NEAR_MIN = 60 // don't drop the next car right on top of you
export const NEAR_MAX = 400 // ...but keep it findable within a short drive
export const FAR = 460 // past this you've driven off — recycle the car back into the ring
/**
 * How far apart two parked pickups must stand, in metres. Road vertices are five
 * metres apart after densifying and a spot is drawn from them blind to the
 * others, so two whole cars could land overlapping and a cluster could fill one
 * view. A car you have to go and find is the entire point of the mode, and it's
 * a wider gap than nitro's — the models are metres across, not a bottle.
 */
export const APART = 80
/**
 * The gap that is never given up, in metres. A cramped grid may have nowhere
 * APART clear, and a car you can reach beats a perfect spread — but two cars in
 * one spot is not a compromise, it's one you can see and one you can't.
 */
export const APART_MIN = 24
/** How many spots to try at each gap before settling for less. */
const TRIES = 30

const BOB_AMP = 0.18 // metres the car rises and falls — a nudge, so it reads as collectable
const BOB_SPEED = 2.2 // radians/s of the bob
const SPIN_SPEED = 0.7 // radians/s it turns on the spot, slow enough to look parked-but-alive
const RING_R = 3.4 // radius of the glow disc under the car (m)

/** Deterministic PRNG (mulberry32) — the scatter must not reshuffle every frame or reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The pickup system for the arcade "find a car" mode.
 *
 * Cars of every type sit scattered on the roads; drive into one and `update`
 * reports its `VehicleType` (main.ts swaps the player into it), and that pickup
 * hops to a fresh far spot as a new random type — so there are always a few out
 * there to find, and the one you just took never blocks the one behind it.
 */
export interface CarPickups {
  /** Scatter the pickable cars over a set of candidate points (road vertices) around the car. */
  setSpots(spots: Vec2[], provider: ElevationProvider, carX: number, carZ: number): void
  /** Bob/spin them and test pickup; returns the type picked this frame, else null. */
  update(carX: number, carZ: number, dt: number): VehicleType | null
  /** Don't spawn pickups of this type — the one the player is already driving (null = no exclusion). */
  setAvoid(type: VehicleType | null): void
  setEnabled(on: boolean): void
  /** Pull the whole field out of the scene and free its geometry and materials. */
  dispose(): void
}

interface Pickup {
  wrap: THREE.Group // holds the car model and its glow ring; we bob and spin this
  car: THREE.Group | null // the current model, rebuilt only when the type changes on respawn
  ring: THREE.Mesh // the soft disc under it, built once and kept across respawns
  type: VehicleType
  x: number
  z: number
  baseY: number // ground height under the car, before the bob is added
  phase: number // a per-car bob offset so five of them don't rise and fall in unison
  active: boolean
}

/** Free a subtree's geometry and materials — a vehicle model is many parts, so traverse. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else if (mat) mat.dispose()
  })
}

/** A soft glowing disc laid flat on the road, so a pickup reads as collectable not parked. */
function glowRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(RING_R * 0.7, RING_R, 24)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe14a,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(geo, mat)
  ring.rotation.x = -Math.PI / 2 // lie it flat on the ground
  ring.position.y = 0.05 // just clear of z-fighting the road
  return ring
}

/** Build the field of pickable cars. Deterministic given `rand` (default a fixed seed). */
export function createCarPickups(scene: THREE.Scene, rand: () => number = mulberry32(0x51c2)): CarPickups {
  const group = new THREE.Group()
  scene.add(group)
  group.userData.neonMover = 'bot' // neon flips the pickable cars to wireframe like the traffic

  const pickups: Pickup[] = []
  for (let i = 0; i < COUNT; i++) {
    const wrap = new THREE.Group()
    const ring = glowRing()
    wrap.add(ring)
    wrap.visible = false
    group.add(wrap)
    pickups.push({ wrap, car: null, ring, type: 'car', x: 0, z: 0, baseY: 0, phase: 0, active: false })
  }

  let spots: Vec2[] = []
  let provider: ElevationProvider | null = null
  let spin = 0
  let enabled = true
  let carX = 0
  let carZ = 0
  let avoid: VehicleType | null = null // the player's current type — never hand it back to them

  const randType = (): VehicleType => {
    let t = VEHICLE_TYPES[Math.floor(rand() * VEHICLE_TYPES.length)]
    // driving up to a pickup only to get the car you're already in is a let-down;
    // re-roll if it matches (capped, in case the roster is ever tiny).
    for (let i = 0; avoid && t === avoid && i < 8; i++) t = VEHICLE_TYPES[Math.floor(rand() * VEHICLE_TYPES.length)]
    return t
  }

  /**
   * Pick a road vertex in the ring around the car, sampling uniformly in one pass
   * (reservoir sampling — no candidate array). Falls back to any spot when the ring
   * is empty, e.g. the car has driven off the far edge of the road network.
   */
  const pickSpot = (): Vec2 | null => {
    let chosen: Vec2 | null = null
    let seen = 0
    for (const s of spots) {
      const d = Math.hypot(s.x - carX, s.z - carZ)
      if (d < NEAR_MIN || d > NEAR_MAX) continue
      seen++
      if (rand() * seen < 1) chosen = s
    }
    if (chosen) return chosen
    return spots.length ? spots[Math.floor(rand() * spots.length)] : null
  }

  /** Is this spot at least `gap` from every other car that is out? */
  const clearOfOthers = (s: Vec2, self: Pickup, gap: number): boolean =>
    pickups.every((o) => o === self || !o.active || Math.hypot(o.x - s.x, o.z - s.z) >= gap)

  /** How far the nearest other car is from a spot. */
  const lonelinessOf = (s: Vec2, self: Pickup): number => {
    let near = Infinity
    for (const o of pickups) {
      if (o === self || !o.active) continue
      near = Math.min(near, Math.hypot(o.x - s.x, o.z - s.z))
    }
    return near
  }

  /** A spot clear of the other cars: nicely so if it can, as far as it can if not. */
  const pickApart = (p: Pickup): Vec2 | null => {
    let best: Vec2 | null = null
    let bestGap = -1
    for (const gap of [APART, APART_MIN]) {
      for (let i = 0; i < TRIES; i++) {
        const s = pickSpot()
        if (!s) return best
        if (clearOfOthers(s, p, gap)) return s
        // Not clear, but remember the roomiest thing we saw: a cramped network may
        // have nowhere clear, and then the emptiest spot going is the answer.
        const room = lonelinessOf(s, p)
        if (room > bestGap) {
          bestGap = room
          best = s
        }
      }
    }
    return best
  }

  /** Swap a pickup's model to `type`, freeing the old one — done only on a respawn, never per frame. */
  const setType = (p: Pickup, type: VehicleType): void => {
    if (p.car && p.type === type) return
    if (p.car) {
      p.wrap.remove(p.car)
      disposeTree(p.car)
    }
    p.type = type
    p.car = buildVehicleMesh(type)
    p.wrap.add(p.car)
    p.wrap.userData.vehicleType = type // so a caller (and the test) can read what's parked here
  }

  /** Place a pickup at a fresh far spot as a new random type, on the ground and visible. */
  const place = (p: Pickup): void => {
    const s = provider ? pickApart(p) : null
    if (!s || !provider) {
      p.active = false
      p.wrap.visible = false
      return
    }
    setType(p, randType())
    p.x = s.x
    p.z = s.z
    p.baseY = provider.heightAt(s.x, s.z) + FLOAT_Y
    p.phase = rand() * Math.PI * 2
    p.wrap.position.set(s.x, p.baseY, s.z)
    p.active = true
    p.wrap.visible = true
  }

  return {
    setSpots(s, prov, x, z) {
      spots = s
      provider = prov
      carX = x
      carZ = z
      for (const p of pickups) place(p)
    },
    update(cx, cz, dt) {
      if (!enabled) return null
      carX = cx
      carZ = cz
      spin += dt
      let picked: VehicleType | null = null
      for (const p of pickups) {
        if (!p.active) continue
        // driven away from this one — bring it back into the ring so the field follows you
        if (Math.hypot(p.x - carX, p.z - carZ) > FAR) {
          place(p)
          continue
        }
        p.wrap.rotation.y = spin * SPIN_SPEED
        p.wrap.position.y = p.baseY + Math.sin(spin * BOB_SPEED + p.phase) * BOB_AMP // gentle bob
        // only the first car reached this frame is taken — one swap per frame
        if (picked === null) {
          const dx = p.x - carX
          const dz = p.z - carZ
          if (dx * dx + dz * dz < PICK_R * PICK_R) {
            picked = p.type
            place(p) // hop it to a fresh far spot as a new type — always a few left to find
          }
        }
      }
      return picked
    },
    setAvoid(type) {
      avoid = type
    },
    setEnabled(on) {
      enabled = on
      group.visible = on
    },
    dispose() {
      for (const p of pickups) {
        if (p.car) disposeTree(p.car)
        disposeTree(p.ring)
      }
      scene.remove(group)
    },
  }
}
