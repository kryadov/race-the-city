import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const COUNT = 6 // checkpoints in a lap
const REACH = 9 // metres: how close counts as through the gate
const MIN_GAP = 140 // metres between consecutive checkpoints
const RING_R = 7

export interface TrialState {
  /** Seconds on the current lap, or null when not running. */
  elapsed: number | null
  /** Checkpoints taken so far this lap. */
  taken: number
  total: number
  /** Best lap in seconds, or null if never finished one. */
  best: number | null
  /** Set for one frame when a lap completes. */
  justFinished: boolean
}

export interface TimeTrial {
  setEnabled(on: boolean): void
  enabled(): boolean
  /** Where the next gate is, for the minimap. Null when there's nothing to chase. */
  nextGate(): Vec2 | null
  /** Every gate, in order — what the rivals race round. Empty until `reset`. */
  course(): Vec2[]
  /** Lay out a fresh course. `bound` is a drivable half-extent — gates stay within it. */
  reset(roads: Road[], provider: ElevationProvider, car: { x: number; z: number }, bound?: number): void
  update(dt: number, carX: number, carZ: number): TrialState
  state(): TrialState
  dispose(): void
}

const BEST_KEY = 'rtc.bestLap'

function loadBest(): number | null {
  try {
    const v = parseFloat(localStorage.getItem(BEST_KEY) ?? '')
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

function saveBest(v: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(v))
  } catch {
    /* ignore */
  }
}

/** mm:ss.t — a lap time you can read at a glance. */
export function formatLap(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Pick checkpoints spread around the city.
 *
 * Taken from road vertices, so every gate is somewhere you can actually drive,
 * and spaced apart — two checkpoints ten metres apart are one checkpoint, and a
 * lap of them would be a formality rather than a drive.
 */
export function pickCourse(roads: Road[], start: Vec2, count = COUNT, rand: () => number = Math.random, bound = Infinity): Vec2[] {
  // Only vertices you can actually drive to: some OSM roads run past the ±RADIUS
  // ground, and a gate out there is a checkpoint you can never reach (you brake at
  // the world edge well before it). `bound` is a drivable half-extent, inside that edge.
  const spots = roads
    .filter((r) => r.kind !== 'path')
    .flatMap((r) => r.points)
    .filter((p) => Math.abs(p.x) <= bound && Math.abs(p.z) <= bound)
  if (spots.length < 2) return []
  const course: Vec2[] = []
  let guard = 0
  while (course.length < count && guard++ < spots.length * 4) {
    const p = spots[Math.floor(rand() * spots.length)]
    const clear = course.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > MIN_GAP)
    if (clear && Math.hypot(p.x - start.x, p.z - start.z) > MIN_GAP * 0.5) course.push(p)
  }
  return course
}

/**
 * Time trial: drive through the gates in order, against the clock.
 *
 * The best lap is kept in localStorage, so it survives a reload and outlives the
 * session — a personal best you lose on refresh isn't one.
 */
export function createTimeTrial(scene: THREE.Scene): TimeTrial {
  const group = new THREE.Group()
  scene.add(group)
  let on = false
  let course: Vec2[] = []
  let rings: THREE.Mesh[] = []
  let taken = 0
  let elapsed: number | null = null
  let best = loadBest()
  let justFinished = false

  // The one you're going for, and the ones after it. A gate you've taken is gone.
  const live = new THREE.MeshStandardMaterial({
    color: 0x1d5e3a,
    emissive: 0x39e07a,
    emissiveIntensity: 1.4,
    flatShading: true,
  })
  const later = new THREE.MeshStandardMaterial({
    color: 0x1b3a4a,
    emissive: 0x2f7fa8,
    emissiveIntensity: 0.5,
    flatShading: true,
  })

  const paint = (): void => {
    rings.forEach((r, i) => {
      r.material = i === taken ? live : later
      r.visible = i >= taken // a gate you've taken is out of the way
    })
  }

  const clear = (): void => {
    for (const r of rings) {
      scene.remove(r)
      group.remove(r)
      r.geometry.dispose()
    }
    rings = []
  }

  const snapshot = (): TrialState => ({ elapsed, taken, total: course.length, best, justFinished })

  return {
    enabled: () => on,
    nextGate: () => (on && course.length ? course[taken] ?? null : null),
    course: () => course,
    setEnabled(v) {
      on = v
      group.visible = v
      if (!v) elapsed = null
    },
    reset(roads, provider, car, bound = Infinity) {
      clear()
      course = pickCourse(roads, car, COUNT, Math.random, bound)
      taken = 0
      elapsed = course.length ? 0 : null
      justFinished = false
      course.forEach((c, i) => {
        // A gate stands up — you drive THROUGH it. TorusGeometry is already
        // upright in the XY plane; rotating it onto XZ laid it flat on the road
        // like a hoop, which is what you saw.
        const geo = new THREE.TorusGeometry(RING_R, 0.45, 6, 20)
        const ring = new THREE.Mesh(geo, live)
        ring.position.set(c.x, provider.heightAt(c.x, c.z) + RING_R * 0.9, c.z)
        // Face it across the way in, so you can see the hole rather than the rim:
        // toward the gate before it, or the start line for the first.
        const prev = i === 0 ? car : course[i - 1]
        ring.rotation.y = Math.atan2(c.x - prev.x, c.z - prev.z)
        group.add(ring)
        rings.push(ring)
      })
      paint()
    },
    update(dt, carX, carZ) {
      justFinished = false
      if (!on || !course.length || elapsed === null) return snapshot()
      elapsed += dt
      const gate = course[taken]
      if (gate && Math.hypot(gate.x - carX, gate.z - carZ) < REACH) {
        taken++
        paint()
        if (taken >= course.length) {
          if (best === null || elapsed < best) {
            best = elapsed
            saveBest(best)
          }
          justFinished = true
          // Straight into the next lap, from where you finished.
          taken = 0
          elapsed = 0
          paint()
        }
      }
      return snapshot()
    },
    state: snapshot,
    dispose() {
      clear()
      scene.remove(group)
    },
  }
}
