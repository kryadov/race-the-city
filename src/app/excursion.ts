import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** How close to a sight counts as visited — a landmark is a big target. */
const REACH = 16
/** Assumed cruising speed the timer is budgeted against, m/s, with slack. */
const BUDGET_SPEED = 11
const TIME_SLACK = 1.9
const MIN_TIME = 26 // no leg ever gives less than this

const BEAM_H = 42 // tall enough to see over the rooftops
const BEAM_R = 1.6

export interface ExcursionState {
  active: boolean
  /** Sights reached on time this tour. */
  visited: number
  /** Seconds left to reach the current sight. */
  timeLeft: number
  /** Metres to the current sight, for the HUD. */
  distance: number
  justVisited: boolean // set for one frame on reaching a sight
  justFailed: boolean // set for one frame when the meter runs out
}

export interface Excursion {
  setEnabled(on: boolean): void
  enabled(): boolean
  /** The current sight, for the minimap arrow. Null when off, or the city has no sights. */
  target(): Vec2 | null
  reset(sights: Vec2[], provider: ElevationProvider, car: { x: number; z: number }): void
  update(dt: number, carX: number, carZ: number): ExcursionState
  state(): ExcursionState
  dispose(): void
}

/** Seconds allowed to cover a→b, generous but finite. */
export function timeBudget(a: Vec2, b: Vec2): number {
  return Math.max(MIN_TIME, (Math.hypot(b.x - a.x, b.z - a.z) / BUDGET_SPEED) * TIME_SLACK)
}

/**
 * The nearest sight to `from`, skipping `avoid` so the tour moves on to a new one
 * each time rather than sitting on the one you just reached. A lone sight (every
 * other excluded) is still returned — one landmark is still a place to visit.
 */
export function nearestSight(sights: Vec2[], from: Vec2, avoid: Vec2 | null): Vec2 | null {
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const s of sights) {
    if (s === avoid) continue
    const d = Math.hypot(s.x - from.x, s.z - from.z)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best ?? (avoid && sights.includes(avoid) ? avoid : null)
}

/**
 * Excursion / tour mode: drive to each city sight (a tourism/historic landmark)
 * before the clock runs out, then straight on to the next-nearest — the score
 * climbs with every one reached. A single tall beam of gold light stands over the
 * CURRENT sight (the minimap arrow points at it too), so there is exactly one
 * beacon to chase, not a pillar over every landmark in the city.
 */
export function createExcursion(scene: THREE.Scene): Excursion {
  const group = new THREE.Group()
  scene.add(group)
  let on = false
  let provider: ElevationProvider = { heightAt: () => 0 }
  let sights: Vec2[] = []
  let current: Vec2 | null = null
  let timeLeft = 0
  let distance = 0
  let visited = 0
  let justVisited = false
  let justFailed = false

  // A translucent gold pillar of light, the same warm gold as the landmark signposts.
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5a3a10,
    emissive: new THREE.Color(0xffc23a),
    transparent: true,
    opacity: 0.5,
    emissiveIntensity: 1.3,
    flatShading: true,
    depthWrite: false,
    fog: false,
  })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R, BEAM_R, BEAM_H, 8, 1, true), mat)
  beam.frustumCulled = false
  beam.visible = false
  group.add(beam)

  const placeBeam = (s: Vec2): void => {
    beam.position.set(s.x, provider.heightAt(s.x, s.z) + BEAM_H / 2, s.z)
    beam.visible = true
  }

  /** Head for the next sight from `from`, or stand down if there are none. */
  const goTo = (from: Vec2): void => {
    current = nearestSight(sights, from, current)
    if (current) {
      timeLeft = timeBudget(from, current)
      placeBeam(current)
    } else {
      timeLeft = 0
      beam.visible = false
    }
  }

  const snapshot = (): ExcursionState => ({
    active: on,
    visited,
    timeLeft: Math.max(0, timeLeft),
    distance,
    justVisited,
    justFailed,
  })

  return {
    enabled: () => on,
    target: () => (on ? current : null),
    setEnabled(v) {
      on = v
      group.visible = v
    },
    reset(s, prov, car) {
      provider = prov
      sights = s
      visited = 0
      distance = 0
      justVisited = false
      justFailed = false
      current = null
      goTo(car)
    },
    update(dt, carX, carZ) {
      justVisited = false
      justFailed = false
      if (!on || !current) return snapshot()
      timeLeft -= dt
      distance = Math.hypot(current.x - carX, current.z - carZ)
      if (distance < REACH) {
        visited++
        justVisited = true
        goTo({ x: carX, z: carZ })
      } else if (timeLeft <= 0) {
        justFailed = true
        goTo({ x: carX, z: carZ })
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
