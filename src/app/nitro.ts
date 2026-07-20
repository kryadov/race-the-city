import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { createPickups, type Pickups } from './pickups'

export { NEAR_MIN, NEAR_MAX, FAR, APART, APART_MIN } from './pickups'

/**
 * The world is a ±RADIUS square around the car (see main.ts). A corridor spot
 * laid past that edge floats off the ground, so we never place one out there.
 */
const RADIUS = 1000

/**
 * Which tiers count as a through-road worth a nitro corridor. These are the
 * arterials that actually cross a city end to end; `trunk` folds into `motorway`
 * and `tertiary` into `secondary` in the parser, so this is the top of the tree.
 */
export const CORRIDOR_KINDS: readonly RoadKind[] = ['motorway', 'primary']
/**
 * Metres between two bottles in a corridor chain. Generous on purpose: close
 * enough that the run reads as one boostable line across the map, far enough
 * that you are never staring at a wall of them. (The near-car scatter uses its
 * own, tighter spacing — this is only the highway run.)
 */
export const CORRIDOR_SPACING = 110
/**
 * How straight a run must be to seed a corridor: end-to-end distance over the
 * arc length actually walked, where 1 is a dead-straight ruler. A gently curving
 * arterial still clears this; a road that doubles back does not.
 */
export const CORRIDOR_STRAIGHT = 0.94
/**
 * The shortest run, end to end, that earns a corridor. A large fraction of the
 * 2·RADIUS-wide map — a chain shorter than this is a side street, not a highway
 * you fly across.
 */
export const CORRIDOR_MIN_SPAN = 700
/**
 * The gap the chain never gives up, in metres. Two corridors that cross or run
 * in parallel must not pile their bottles into one spot; this is the minimum any
 * two chained bottles may stand apart. Sits below CORRIDOR_SPACING so a chain's
 * own, evenly spaced bottles all survive.
 */
export const CORRIDOR_MIN_APART = 99
/**
 * When a corridor overlays the scatter, the arterial's own densified vertices
 * (five metres apart) would drown the spaced chain. So a scatter spot this close
 * to a chain bottle is dropped: on the highway you get the chain, off it the
 * usual crowd. Roughly half the spacing, so cross-streets keep their scatter.
 */
export const CORRIDOR_CLEAR = 55

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)

/**
 * The near-straight sub-runs of a polyline. Grown greedily: a run keeps swallowing
 * vertices while its end-to-end distance stays within CORRIDOR_STRAIGHT of the arc
 * length walked, and closes the moment the next vertex would bend it past that.
 * A road that curves is thus cut into its straight stretches, each judged on its own.
 */
function straightRuns(points: Vec2[]): Vec2[][] {
  const runs: Vec2[][] = []
  let i = 0
  while (i < points.length - 1) {
    let arc = 0
    let j = i
    while (j + 1 < points.length) {
      const arcNext = arc + dist(points[j], points[j + 1])
      // reject the next vertex if it bends the run from the start below threshold
      if (arcNext > 0 && dist(points[i], points[j + 1]) / arcNext < CORRIDOR_STRAIGHT) break
      arc = arcNext
      j++
    }
    if (j > i && dist(points[i], points[j]) >= CORRIDOR_MIN_SPAN) runs.push(points.slice(i, j + 1))
    i = Math.max(j, i + 1)
  }
  return runs
}

/** Drop bottles every CORRIDOR_SPACING metres along a run, walking it by arc length. */
function layAlong(run: Vec2[], radius: number): Vec2[] {
  const out: Vec2[] = []
  let carry = 0 // metres to walk into the next segment before the first drop
  for (let k = 0; k < run.length - 1; k++) {
    const a = run[k]
    const b = run[k + 1]
    const seg = dist(a, b)
    if (seg === 0) continue
    let t = carry
    while (t <= seg) {
      const f = t / seg
      const p = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }
      if (Math.abs(p.x) <= radius && Math.abs(p.z) <= radius) out.push(p)
      t += CORRIDOR_SPACING
    }
    carry = t - seg
  }
  return out
}

/** Thin a chain so no two bottles fall within CORRIDOR_MIN_APART — where two runs meet. */
function spaced(pts: Vec2[]): Vec2[] {
  const kept: Vec2[] = []
  for (const p of pts) {
    if (kept.every((q) => dist(p, q) >= CORRIDOR_MIN_APART)) kept.push(p)
  }
  return kept
}

/**
 * A spaced chain of nitro spots laid along every long, near-straight arterial in
 * range: drive one and you can boost the whole way across the map. Deterministic —
 * no randomness — and kept inside the ±radius square.
 */
export function corridorSpots(roads: Road[], radius: number = RADIUS): Vec2[] {
  const chain: Vec2[] = []
  for (const r of roads) {
    if (!CORRIDOR_KINDS.includes(r.kind)) continue
    for (const run of straightRuns(r.points)) chain.push(...layAlong(run, radius))
  }
  return spaced(chain)
}

/**
 * Merge a corridor chain into the near-car scatter. The chain wins its ground:
 * scatter spots within CORRIDOR_CLEAR of a chain bottle are dropped, so the
 * arterial reads as the evenly spaced line rather than the five-metre vertex
 * crowd it was densified into. Everything off the corridor is left untouched.
 */
function withCorridor(scatter: Vec2[], chain: Vec2[]): Vec2[] {
  if (!chain.length) return scatter
  const clear = scatter.filter((s) => chain.every((c) => dist(c, s) >= CORRIDOR_CLEAR))
  return [...chain, ...clear]
}

/**
 * A kind of nitrous bottle. The colour is the tell; the numbers are the point.
 *
 * `mult` is the top-speed multiplier at full boost, `accel` the acceleration
 * bonus factor, `time` the seconds the window lasts. A player learns to read the
 * colour: red is a short hard punch, green a long gentle push, blue the balanced
 * standard they already know.
 */
export interface NitroType {
  id: 'standard' | 'punch' | 'surge'
  /** Bottle body colour. */
  color: number
  /** Top-speed multiplier at full boost (the old fixed BOOST_MULT). */
  mult: number
  /** Acceleration bonus factor at full boost (the old fixed `2`). */
  accel: number
  /** How long the boost window lasts, in seconds. */
  time: number
}

/**
 * The nitro roster. Blue is the original feel (×10 top speed, 2.5s) so nothing a
 * player knew changed; red trades duration for a harder, faster hit; green trades
 * the hit for a long steady pull. Kept short so the field reads as three clear
 * colours, not a rainbow.
 */
export const NITRO_TYPES: readonly NitroType[] = [
  { id: 'standard', color: 0x39c6ff, mult: 10, accel: 2.0, time: 2.5 },
  { id: 'punch', color: 0xff4d3a, mult: 15, accel: 3.4, time: 1.3 },
  { id: 'surge', color: 0x49e06a, mult: 7, accel: 1.2, time: 4.6 },
]

/**
 * Which nitro type bottle `i` in the field is. A plain cycle so the handful of
 * bottles out at once always shows every colour — deterministic, no reshuffle.
 */
export const nitroTypeFor = (i: number): NitroType =>
  NITRO_TYPES[((i % NITRO_TYPES.length) + NITRO_TYPES.length) % NITRO_TYPES.length]

/** A glowing NOS-style bottle used as a speed-boost pickup, tinted for its type. */
function bottleMesh(type: NitroType): THREE.Group {
  const g = new THREE.Group()
  const emissive = new THREE.Color(type.color).multiplyScalar(0.5)
  const mat = new THREE.MeshStandardMaterial({ color: type.color, emissive, emissiveIntensity: 0.7, flatShading: true })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10), mat)
  body.position.y = 0.55
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 0.35, 10), mat)
  shoulder.position.y = 1.28
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 8), mat)
  neck.position.y = 1.55
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xffcf3a, flatShading: true }))
  cap.position.y = 1.72
  g.add(body, shoulder, neck, cap)
  return g
}

/**
 * Speed-boost pickups, scattered on the roads. Same ring-around-the-car scatter
 * as every pickup, plus a highway extra: hand `setSpots` the full road list and
 * it lays a spaced chain along each long straight arterial, so an arterial you
 * find becomes a corridor you can boost the whole way across.
 */
export interface Nitro extends Pickups<NitroType> {
  setSpots(spots: Vec2[], provider: ElevationProvider, carX?: number, carZ?: number, roads?: Road[]): void
}

/** Build the nitro field — a spread of colour-coded bottles, each reporting its own boost. */
export function createNitro(scene: THREE.Scene): Nitro {
  const base = createPickups<NitroType>(scene, (i) => bottleMesh(nitroTypeFor(i)), undefined, nitroTypeFor)
  return {
    ...base,
    setSpots(spots, provider, carX = 0, carZ = 0, roads) {
      const merged = roads ? withCorridor(spots, corridorSpots(roads)) : spots
      base.setSpots(merged, provider, carX, carZ)
    },
  }
}
