import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Street furniture from OSM: benches (some empty, some with a person sat on
 * them) and bus stops, standing on the terrain.
 *
 * Everything is instanced — one draw per part-kind for the whole city, no matter
 * how many benches or stops there are. A bench is a metal frame with wooden
 * slats; roughly two in five carry a simple blocky seated figure. A bus stop is
 * a two-post shelter with a flat roof and a sign on its own post beside it.
 *
 * Neon: every material is a `MeshStandardMaterial` with `flatShading`, so
 * `ThemeController` can flip the whole group to wireframe + emissive and back.
 * The seated figures carry their colour in `instanceColor` (a white base
 * material so `material.color * instanceColor` lands exactly on the picked
 * shade); the rigid furniture uses its material colour directly.
 */

const UP = new THREE.Vector3(0, 1, 0)

/** Share of benches that get someone sitting on them. */
const OCCUPANCY = 0.4

// A muted, low-poly palette in keeping with the rest of the city.
const METAL = 0x565a5f // bench legs and back frame
const WOOD = 0x93744f // bench slats
const POLE = 0x74777c // bus-stop poles and roof
const SIGN = 0x2f5d86 // bus-stop sign (a muted blue, not the green of road signs)
const SKIN = 0xc39a72
const SHIRT = 0x6d7f8e
const TROUSER = 0x40434a

/** A bench (or stop) this close to a road lines up parallel to it, not any-old-way. */
const ROADSIDE_DIST = 13
/** Keep the clutter down — OSM over-maps benches in a well-surveyed city. */
const BENCH_CAP = 55
const BUSSTOP_CAP = 40

/** A placed item: where it stands and which way it faces. */
interface Placed {
  x: number
  z: number
  yaw: number
}

/** Squared distance from (x,z) to segment a-b. */
function segDist2(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
  const cx = a.x + dx * t
  const cz = a.z + dz * t
  return (x - cx) ** 2 + (z - cz) ** 2
}

/** Nearest drivable road segment to (x,z): its distance and heading, or null. */
function nearestRoad(x: number, z: number, roads: Road[]): { dist: number; angle: number } | null {
  let bestD2 = Infinity
  let angle = 0
  for (const r of roads) {
    if (r.bridge || r.tunnel) continue
    const p = r.points
    for (let i = 0; i < p.length - 1; i++) {
      const d2 = segDist2(x, z, p[i], p[i + 1])
      if (d2 < bestD2) {
        bestD2 = d2
        angle = Math.atan2(p[i + 1].z - p[i].z, p[i + 1].x - p[i].x)
      }
    }
  }
  return bestD2 === Infinity ? null : { dist: Math.sqrt(bestD2), angle }
}

/** Keep at most `max`, evenly spaced through the list. */
function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const out: T[] = []
  const step = items.length / max
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += step) out.push(items[Math.floor(i)])
  return out
}

/**
 * Place items: thin them to a cap, and orient each — parallel to the nearest
 * road when it's roadside (so a run of benches stands in a line down the street),
 * any-which-way when it's out in the open (a park bench faces the view, not a kerb).
 */
function place(spots: Vec2[], roads: Road[], cap: number, rand: () => number): Placed[] {
  return thin(spots, cap).map((s) => {
    const near = nearestRoad(s.x, s.z, roads)
    const yaw = near && near.dist < ROADSIDE_DIST ? near.angle : rand() * Math.PI * 2
    return { x: s.x, z: s.z, yaw }
  })
}

/**
 * Benches (with a fraction seated) and bus stops, sitting on `provider`'s
 * surface. `rand` is injectable so the layout can be made stable across reloads
 * by passing a seeded PRNG (see greenery.ts / props.ts for why that matters);
 * it defaults to `Math.random`.
 */
export function buildStreetFurniture(
  benches: Vec2[],
  busStops: Vec2[],
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): THREE.Group {
  const group = new THREE.Group()
  const placedBenches = place(benches, roads, BENCH_CAP, rand)
  const placedStops = place(busStops, roads, BUSSTOP_CAP, rand)
  if (placedBenches.length) addBenches(group, placedBenches, provider, rand)
  if (placedStops.length) addBusStops(group, placedStops, provider)
  return group
}

/** One seated figure's world position and the yaw of the bench it sits on. */
interface Seat {
  x: number
  z: number
  yaw: number
}

function addBenches(group: THREE.Group, benches: Placed[], provider: ElevationProvider, rand: () => number): void {
  const n = benches.length
  const frame = new THREE.InstancedMesh(benchFrameGeo(), matte(METAL), n)
  const slats = new THREE.InstancedMesh(benchSlatGeo(), matte(WOOD), n)
  frame.name = 'bench-frame'
  slats.name = 'bench-slats'
  // Spread across the whole city; three computes an InstancedMesh's bounding
  // sphere once, so keep every batch out of the frustum-cull so none blinks.
  frame.frustumCulled = false
  slats.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const seats: Seat[] = []

  for (let i = 0; i < n; i++) {
    const b = benches[i]
    const yaw = b.yaw // parallel to the road when roadside, else free (see `place`)
    const sit = rand() < OCCUPANCY
    q.setFromAxisAngle(UP, yaw)
    pos.set(b.x, provider.heightAt(b.x, b.z), b.z)
    m.compose(pos, q, one)
    frame.setMatrixAt(i, m)
    slats.setMatrixAt(i, m)
    if (sit) seats.push({ x: b.x, z: b.z, yaw })
  }
  frame.instanceMatrix.needsUpdate = true
  slats.instanceMatrix.needsUpdate = true
  group.add(frame, slats)

  if (seats.length) addFigures(group, seats, provider, rand)
}

/**
 * The people on the occupied benches: head, torso and bent legs, one instanced
 * mesh each. The figure geometry is baked in the bench's local frame (back
 * against +Z, facing −Z), so the bench's own position + yaw seats it correctly.
 * Clothing and skin vary per instance via `setColorAt` on a white base.
 */
function addFigures(group: THREE.Group, seats: Seat[], provider: ElevationProvider, rand: () => number): void {
  const n = seats.length
  const head = new THREE.InstancedMesh(figureHeadGeo(), white(), n)
  const torso = new THREE.InstancedMesh(figureTorsoGeo(), white(), n)
  const legs = new THREE.InstancedMesh(figureLegsGeo(), white(), n)
  head.name = 'figure-head'
  torso.name = 'figure-torso'
  legs.name = 'figure-legs'
  for (const im of [head, torso, legs]) im.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const col = new THREE.Color()

  for (let i = 0; i < n; i++) {
    const s = seats[i]
    q.setFromAxisAngle(UP, s.yaw)
    pos.set(s.x, provider.heightAt(s.x, s.z), s.z)
    m.compose(pos, q, one)
    head.setMatrixAt(i, m)
    torso.setMatrixAt(i, m)
    legs.setMatrixAt(i, m)
    head.setColorAt(i, col.setHex(SKIN).offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12))
    torso.setColorAt(i, col.setHex(SHIRT).offsetHSL((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.18, (rand() - 0.5) * 0.14))
    legs.setColorAt(i, col.setHex(TROUSER).offsetHSL((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.1))
  }
  for (const im of [head, torso, legs]) {
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }
  group.add(head, torso, legs)
}

function addBusStops(group: THREE.Group, busStops: Placed[], provider: ElevationProvider): void {
  const n = busStops.length
  const frame = new THREE.InstancedMesh(busStopFrameGeo(), matte(POLE), n)
  const sign = new THREE.InstancedMesh(busStopSignGeo(), matte(SIGN), n)
  frame.name = 'busstop-frame'
  sign.name = 'busstop-sign'
  frame.frustumCulled = false
  sign.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)

  for (let i = 0; i < n; i++) {
    const b = busStops[i]
    q.setFromAxisAngle(UP, b.yaw)
    pos.set(b.x, provider.heightAt(b.x, b.z), b.z)
    m.compose(pos, q, one)
    frame.setMatrixAt(i, m)
    sign.setMatrixAt(i, m)
  }
  frame.instanceMatrix.needsUpdate = true
  sign.instanceMatrix.needsUpdate = true
  group.add(frame, sign)
}

// --- geometry (local space, y = 0 at the ground) --------------------------

/** A box translated so its centre sits at (x, y, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/**
 * The bench's metal skeleton: four legs and two uprights that carry the back.
 * Merged into one geometry so every bench in the city is a single instanced
 * draw for its frame.
 */
function benchFrameGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [0.8, -0.8]) {
    for (const sz of [0.16, -0.16]) parts.push(box(0.07, 0.45, 0.07, sx, 0.225, sz)) // legs
    parts.push(box(0.07, 0.55, 0.07, sx, 0.725, 0.18)) // back upright, above the rear legs
  }
  return mergeGeometries(parts)
}

/** The wooden slats: three across the seat, two up the back. One draw for all. */
function benchSlatGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const sz of [-0.15, 0, 0.15]) parts.push(box(1.7, 0.05, 0.12, 0, 0.46, sz)) // seat
  for (const sy of [0.62, 0.82]) parts.push(box(1.7, 0.12, 0.05, 0, sy, 0.19)) // back
  return mergeGeometries(parts)
}

/** A blocky head, sat on the shoulders and leaning against the backrest. */
function figureHeadGeo(): THREE.BufferGeometry {
  return box(0.2, 0.22, 0.2, 0, 1.18, 0.06)
}

/** A blocky torso rising off the seat. */
function figureTorsoGeo(): THREE.BufferGeometry {
  return box(0.34, 0.55, 0.24, 0, 0.78, 0.08)
}

/**
 * Bent legs: two thighs lying forward across the seat and two shins dropping to
 * the ground — the pose that reads as "sitting" rather than "standing on a
 * bench". Merged, so both legs cost one instanced draw.
 */
function figureLegsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [0.11, -0.11]) {
    parts.push(box(0.14, 0.14, 0.42, sx, 0.52, -0.13)) // thigh, hip → knee (toward −Z)
    parts.push(box(0.13, 0.45, 0.13, sx, 0.225, -0.32)) // shin, knee → ground
  }
  return mergeGeometries(parts)
}

/**
 * A bus shelter: two back poles carrying a flat roof, plus a slimmer post out
 * front that holds the sign. Merged into one geometry — one draw per city.
 */
function busStopFrameGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [0.85, -0.85]) parts.push(box(0.08, 2.4, 0.08, sx, 1.2, 0.55)) // back poles
  parts.push(box(1.9, 0.08, 1.1, 0, 2.44, 0.05)) // flat roof, cantilevered forward a touch
  parts.push(box(0.06, 2.2, 0.06, 1.05, 1.1, -0.55)) // sign post, out front beside the shelter
  return mergeGeometries(parts)
}

/** The small flat sign on top of the sign post. */
function busStopSignGeo(): THREE.BufferGeometry {
  return box(0.5, 0.5, 0.06, 1.05, 2.0, -0.55)
}

// --- materials (fresh per build, so teardown disposes them cleanly) --------

/** A flat-shaded matte solid in the given colour. */
const matte = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0.0 })

/**
 * A white base for a per-instance-coloured mesh: three multiplies
 * `material.color * instanceColor`, so a white base lets `setColorAt` land the
 * figure's colour exactly instead of squaring it.
 */
const white = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 })
