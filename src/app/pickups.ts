import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const DEFAULT_COUNT = 14 // pickups present at once
const PICK_R = 4 // pickup radius (m)
const RESPAWN = 10 // seconds before a collected bottle reappears elsewhere
const FLOAT_Y = 1.4 // hover height above the road

// Bottles are placed in a ring around the car. Scattering them over the whole
// 1000m-radius city (~3 km²) put them outside the ~150m the player can see, so
// most cities looked like they had no nitro at all.
export const NEAR_MIN = 40 // don't drop one in the player's lap
export const NEAR_MAX = 350 // ...but keep it findable. Wide enough to spread COUNT of them out
export const FAR = 400 // past this the car has driven off; recycle the bottle
/**
 * How far apart two bottles must stand, in metres.
 *
 * Road vertices are five metres apart after densifying, and a spot was drawn
 * from them with nothing said about the others — so two bottles could land
 * touching, and four could fill one view. A pickup you have to go and find is
 * the point of them.
 */
export const APART = 60
/**
 * The gap that is never given up, in metres.
 *
 * A cramped road network may have nowhere APART metres clear, and a bottle you
 * can reach beats a perfect spread. Two bottles in the same spot is not a
 * compromise, though — it is one bottle you cannot see and one you can.
 */
export const APART_MIN = 14
/** How many spots to try at each gap before settling for less. */
const TRIES = 30

export interface Pickups {
  /** Scatter the pickups over a set of candidate points (road vertices) around the car. */
  setSpots(spots: Vec2[], provider: ElevationProvider, carX?: number, carZ?: number): void
  /** Spin/bob them and test pickup; returns true if one was collected. */
  update(carX: number, carZ: number, dt: number): boolean
  setEnabled(on: boolean): void
  reset(): void
}

interface Bottle {
  mesh: THREE.Group
  x: number
  z: number
  active: boolean
  respawn: number
}

/**
 * Things you drive over to collect, scattered on the roads around you.
 *
 * The scattering is the whole substance of this and none of it is about what the
 * thing IS: a ring around the car so you can find them, a gap between them so
 * two do not land in one view, a respawn elsewhere once taken. Nitro and petrol
 * want every word of that and differ only in the model, so they get it from
 * here rather than from a copy of it.
 *
 * @param build the model, standing on the ground at its own origin
 */
export function createPickups(scene: THREE.Scene, build: () => THREE.Group, count = DEFAULT_COUNT): Pickups {
  const group = new THREE.Group()
  scene.add(group)
  const bottles: Bottle[] = []
  for (let i = 0; i < count; i++) {
    const mesh = build()
    mesh.visible = false
    group.add(mesh)
    bottles.push({ mesh, x: 0, z: 0, active: false, respawn: 0 })
  }

  let spots: Vec2[] = []
  let provider: ElevationProvider | null = null
  let spin = 0
  let enabled = true
  let carX = 0
  let carZ = 0

  /**
   * Pick a road vertex in the ring around the car, sampling uniformly in one pass
   * (reservoir sampling — no candidate array). Falls back to any spot when the ring
   * is empty, e.g. the car is off the far edge of the road network.
   */
  const pickSpot = (): Vec2 | null => {
    let chosen: Vec2 | null = null
    let seen = 0
    for (const s of spots) {
      const d = Math.hypot(s.x - carX, s.z - carZ)
      if (d < NEAR_MIN || d > NEAR_MAX) continue
      seen++
      if (Math.random() * seen < 1) chosen = s
    }
    if (chosen) return chosen
    return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null
  }

  /** Is this spot at least `gap` from every other bottle that is out? */
  const clearOfOthers = (s: Vec2, self: Bottle, gap: number): boolean =>
    bottles.every((o) => o === self || !o.active || Math.hypot(o.x - s.x, o.z - s.z) >= gap)

  /** How far the nearest other bottle is from a spot. */
  const lonelinessOf = (s: Vec2, self: Bottle): number => {
    let near = Infinity
    for (const o of bottles) {
      if (o === self || !o.active) continue
      near = Math.min(near, Math.hypot(o.x - s.x, o.z - s.z))
    }
    return near
  }

  /** A spot away from the other bottles: nicely so if it can, as far as it can if not. */
  const pickApart = (b: Bottle): Vec2 | null => {
    let best: Vec2 | null = null
    let bestGap = -1
    for (const gap of [APART, APART_MIN]) {
      for (let i = 0; i < TRIES; i++) {
        const s = pickSpot()
        if (!s) return best
        if (clearOfOthers(s, b, gap)) return s
        // Not clear, but remember the roomiest thing we saw: a cramped network
        // may have nowhere clear at all, and then the emptiest spot going is the
        // answer. Taking the last random one instead put two in the same place,
        // which is not a compromise — it is one bottle you can see and one you
        // cannot.
        const room = lonelinessOf(s, b)
        if (room > bestGap) {
          bestGap = room
          best = s
        }
      }
    }
    return best
  }

  const place = (b: Bottle): void => {
    const s = provider ? pickApart(b) : null
    if (!s || !provider) {
      b.active = false
      b.mesh.visible = false
      return
    }
    b.x = s.x
    b.z = s.z
    b.mesh.position.set(s.x, provider.heightAt(s.x, s.z) + FLOAT_Y, s.z)
    b.active = true
    b.mesh.visible = true
  }

  return {
    setSpots(s, p, x = 0, z = 0) {
      spots = s
      provider = p
      carX = x
      carZ = z
      for (const b of bottles) {
        b.respawn = 0
        place(b)
      }
    },
    update(cx, cz, dt) {
      if (!enabled) return false
      carX = cx
      carZ = cz
      spin += dt
      let picked = false
      for (const b of bottles) {
        if (b.active) {
          // the car has driven away from this one — bring it back into the ring
          if (Math.hypot(b.x - carX, b.z - carZ) > FAR) {
            place(b)
            continue
          }
          b.mesh.rotation.y = spin * 2
          b.mesh.position.y += Math.sin(spin * 3 + b.x) * 0.004 // gentle bob
          const dx = b.x - carX
          const dz = b.z - carZ
          if (dx * dx + dz * dz < PICK_R * PICK_R) {
            b.active = false
            b.mesh.visible = false
            b.respawn = RESPAWN
            picked = true
          }
        } else if (b.respawn > 0) {
          b.respawn -= dt
          if (b.respawn <= 0) place(b)
        }
      }
      return picked
    },
    setEnabled(on) {
      enabled = on
      group.visible = on
    },
    reset() {
      for (const b of bottles) {
        b.respawn = 0
        place(b)
      }
    },
  }
}
