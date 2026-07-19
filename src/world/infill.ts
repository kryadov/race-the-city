import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building, Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

/**
 * Infill for the bare ground between buildings.
 *
 * OSM maps the buildings and the streets, but the odd-shaped scraps of land left
 * *between* them come through empty — a car threading a back street passes blank
 * dirt where a real city has a bench and a couple of trees. This drops exactly
 * that into the gaps: a handful of benches and a scatter of small trees, placed
 * only where there is genuinely nothing else — off the roads, out of the water,
 * clear of every building footprint and of anything already standing there
 * (mapped trees, props, other furniture — passed in as `blockers`).
 *
 * It is all instanced (one draw per part) and capped map-wide, built once at
 * load with no per-frame cost, and deterministic given `rand` — the same seed
 * lays the same benches and trees on every browser and reload. Everything sits
 * on the terrain via `provider.heightAt`, like greenery.ts and streetFurniture.ts.
 */

const UP = new THREE.Vector3(0, 1, 0)

/** Candidate spacing: one prospective gap-filler every ~this many metres. */
const GRID_M = 22
/** A gap-filler must be no further than this from a building — that is what makes
 * it an *inter-building* gap and not open countryside, which greenery.ts fills. */
const BUILDING_REACH = 34
/** Keep clear of the carriageway: a bench in the road is worse than a bare verge. */
const ROAD_CLEAR = 6
/** Stay out of the water and off its very edge. */
const WATER_CLEAR = 5
/** Give anything already mapped (trees, props, furniture) a wide berth. */
const BLOCKER_CLEAR = 6
/** Don't stack infill on itself — benches and trees keep this far apart. */
const SELF_CLEAR = 7

/** Map-wide budgets. A city gets a modest sprinkle, not a garden centre. */
const BENCH_CAP = 30
const TREE_CAP = 300
/** Of the primary gap points, this share seed a bench; the rest seed a tree clump. */
const BENCH_SHARE = 0.12
/** A tree point spawns a small clump — this many, at up to CLUMP_R metres around it. */
const CLUMP_MIN = 1
const CLUMP_MAX = 3
const CLUMP_R = 4
/** Bound the candidate scan so even a sprawling map is cheap to sample. */
const CANDIDATE_CAP = 8000
/** Fixed seed → identical infill on every browser and reload (see greenery.ts). */
const INFILL_SEED = 0x3c7bd91e

// A muted, low-poly palette in keeping with streetFurniture.ts and greenery.ts.
const METAL = 0x565a5f // bench legs and back frame
const WOOD = 0x93744f // bench slats
const TRUNK = 0x6b4a2b
const LEAF = 0x4f8a3a

/** The bench caps, exported for the count-cap test. */
export const INFILL_BENCH_CAP = BENCH_CAP
/** The tree cap, exported for the count-cap test. */
export const INFILL_TREE_CAP = TREE_CAP

/** Deterministic PRNG (mulberry32) — the greenery.ts idiom, so infill is stable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A placed bench: where it stands and which way it faces. */
interface Placed {
  x: number
  z: number
  yaw: number
}

/** What a collect pass yields: benches (oriented) and tree points (a clump each). */
export interface InfillSpots {
  benches: Placed[]
  trees: Vec2[]
}

/** An axis-aligned bounds, with the ring it was measured from for the inside test. */
interface Box {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  cx: number
  cz: number
  ring: Vec2[]
}

function bbox(ring: Vec2[]): Box {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, minZ, maxX, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, ring }
}

/** Squared distance from (x,z) to a box (0 inside/touching it). */
function boxDist2(x: number, z: number, b: Box): number {
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0
  return dx * dx + dz * dz
}

/** Squared distance from (x,z) to segment a-b — the streetFurniture.ts helper. */
function segDist2(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
  const cx = a.x + dx * t
  const cz = a.z + dz * t
  return (x - cx) ** 2 + (z - cz) ** 2
}

/**
 * Choose bench and tree spots in the empty gaps between buildings.
 *
 * A jittered grid over the buildings' bounding region, each candidate kept only
 * if it is near a building (an *inter-building* gap) yet inside none, clear of
 * every road, out of the water, and away from every blocker and from the infill
 * already placed. Accepted points split BENCH_SHARE : rest into benches (facing
 * out from the nearest building) and tree clumps, each capped map-wide.
 *
 * Pure and deterministic given `rand` — buildInfill draws the meshes from it.
 */
export function collectInfill(
  buildings: Building[],
  roads: Road[],
  blockers: Vec2[],
  water: Vec2[][],
  rand: () => number,
): InfillSpots {
  const spots: InfillSpots = { benches: [], trees: [] }
  const boxes = buildings.filter((b) => b.footprint.length >= 3).map((b) => bbox(b.footprint))
  if (!boxes.length) return spots // no buildings → no gaps to fill

  // The region to sample: the buildings' extent, grown by the reach so gaps on
  // the outer edge of the city aren't clipped off.
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX
    if (b.minZ < minZ) minZ = b.minZ
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxZ > maxZ) maxZ = b.maxZ
  }
  minX -= BUILDING_REACH; minZ -= BUILDING_REACH; maxX += BUILDING_REACH; maxZ += BUILDING_REACH

  // Widen the grid step if the region is huge, so the candidate count stays under
  // CANDIDATE_CAP however big the map is (the thinning idiom, applied up front).
  const area = (maxX - minX) * (maxZ - minZ)
  const step = Math.max(GRID_M, Math.sqrt(area / CANDIDATE_CAP))

  const drivable = roads.filter((r) => !r.bridge && !r.tunnel)
  const waterBoxes = water.filter((w) => w.length >= 3).map(bbox)
  const reach2 = BUILDING_REACH * BUILDING_REACH
  const placed: Vec2[] = [] // infill laid so far, for the self-spacing check

  /** Is (x,z) genuinely empty ground — off every building, road, water and blocker? */
  const isClear = (x: number, z: number): boolean => {
    for (const b of boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPolygon(x, z, b.ring)) return false
    }
    for (const r of drivable) {
      const p = r.points
      for (let i = 0; i < p.length - 1; i++) if (segDist2(x, z, p[i], p[i + 1]) < ROAD_CLEAR * ROAD_CLEAR) return false
    }
    for (const w of waterBoxes) {
      if (boxDist2(x, z, w) > WATER_CLEAR * WATER_CLEAR) continue // bbox too far: skip the edge walk
      if (pointInPolygon(x, z, w.ring)) return false
      const p = w.ring
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (segDist2(x, z, p[j], p[i]) < WATER_CLEAR * WATER_CLEAR) return false
    }
    for (const g of blockers) if ((x - g.x) ** 2 + (z - g.z) ** 2 < BLOCKER_CLEAR * BLOCKER_CLEAR) return false
    for (const q of placed) if ((x - q.x) ** 2 + (z - q.z) ** 2 < SELF_CLEAR * SELF_CLEAR) return false
    return true
  }

  /** The building whose bounds sit nearest (x,z), for orientation and the reach test. */
  const nearestBox = (x: number, z: number): { box: Box; dist2: number } => {
    let best = boxes[0]
    let bestD2 = Infinity
    for (const b of boxes) {
      const d2 = boxDist2(x, z, b)
      if (d2 < bestD2) { bestD2 = d2; best = b }
    }
    return { box: best, dist2: bestD2 }
  }

  for (let z = minZ; z <= maxZ; z += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (spots.benches.length >= BENCH_CAP && spots.trees.length >= TREE_CAP) return spots
      const jx = x + (rand() - 0.5) * step
      const jz = z + (rand() - 0.5) * step
      const near = nearestBox(jx, jz)
      if (near.dist2 > reach2) continue // out in the open, not an inter-building gap
      if (!isClear(jx, jz)) continue
      if (rand() < BENCH_SHARE && spots.benches.length < BENCH_CAP) {
        // Face out from the wall it backs onto: away from the nearest building.
        const yaw = Math.atan2(jz - near.box.cz, jx - near.box.cx)
        spots.benches.push({ x: jx, z: jz, yaw })
        placed.push({ x: jx, z: jz })
      } else if (spots.trees.length < TREE_CAP) {
        // A small clump, so the gap reads as planted rather than dotted. Each
        // extra tree runs the same clearance test, so none strays onto a road.
        const clump = CLUMP_MIN + Math.floor(rand() * (CLUMP_MAX - CLUMP_MIN + 1))
        spots.trees.push({ x: jx, z: jz })
        placed.push({ x: jx, z: jz })
        for (let c = 1; c < clump && spots.trees.length < TREE_CAP; c++) {
          const tx = jx + (rand() - 0.5) * 2 * CLUMP_R
          const tz = jz + (rand() - 0.5) * 2 * CLUMP_R
          if (!isClear(tx, tz)) continue
          spots.trees.push({ x: tx, z: tz })
          placed.push({ x: tx, z: tz })
        }
      }
    }
  }
  return spots
}

/**
 * Benches and trees dropped into the empty ground between buildings, sitting on
 * `provider`'s surface. `blockers` are the points already taken (mapped trees,
 * props, other furniture) that infill keeps clear of; `rand` is injectable so
 * the layout can be made stable across reloads (defaults to a seeded PRNG).
 */
export function buildInfill(
  buildings: Building[],
  roads: Road[],
  blockers: Vec2[],
  water: Vec2[][],
  provider: ElevationProvider,
  rand: () => number = makeRng(INFILL_SEED),
): THREE.Object3D {
  const group = new THREE.Group()
  const spots = collectInfill(buildings, roads, blockers, water, rand)
  if (spots.benches.length) addBenches(group, spots.benches, provider)
  if (spots.trees.length) addTrees(group, spots.trees, provider, rand)
  return group
}

function addBenches(group: THREE.Group, benches: Placed[], provider: ElevationProvider): void {
  const n = benches.length
  const frame = new THREE.InstancedMesh(benchFrameGeo(), matte(METAL), n)
  const slats = new THREE.InstancedMesh(benchSlatGeo(), matte(WOOD), n)
  frame.name = 'infill-bench-frame'
  slats.name = 'infill-bench-slats'
  // Spread across the whole city; keep every batch out of the frustum-cull so
  // none blinks (three computes one bounding sphere for the lot).
  frame.frustumCulled = false
  slats.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < n; i++) {
    const b = benches[i]
    q.setFromAxisAngle(UP, b.yaw)
    pos.set(b.x, provider.heightAt(b.x, b.z), b.z)
    m.compose(pos, q, one)
    frame.setMatrixAt(i, m)
    slats.setMatrixAt(i, m)
  }
  frame.instanceMatrix.needsUpdate = true
  slats.instanceMatrix.needsUpdate = true
  group.add(frame, slats)
}

function addTrees(group: THREE.Group, spots: Vec2[], provider: ElevationProvider, rand: () => number): void {
  const n = spots.length
  // One instanced draw for every trunk, one for every crown — a simple low-poly
  // tree (greenery.ts owns the seasonal, latitude-aware ones; infill's are plain).
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 2, 5), matte(TRUNK), n)
  const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), matte(LEAF), n)
  trunk.name = 'infill-tree-trunk'
  foliage.name = 'infill-tree-foliage'
  trunk.frustumCulled = false
  foliage.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const s = 0.7 + rand() * 0.7 // size variety, as in greenery.ts
    const y = provider.heightAt(spots[i].x, spots[i].z)
    q.setFromAxisAngle(UP, rand() * Math.PI * 2)
    scl.set(s, s, s)
    pos.set(spots[i].x, y + s, spots[i].z) // trunk (2 tall, centred) sits with its foot on the ground
    trunk.setMatrixAt(i, m.compose(pos, q, scl))
    pos.set(spots[i].x, y + 3.6 * s, spots[i].z) // crown atop the trunk (folY of greenery's broadleaf)
    foliage.setMatrixAt(i, m.compose(pos, q, scl))
  }
  trunk.instanceMatrix.needsUpdate = true
  foliage.instanceMatrix.needsUpdate = true
  group.add(trunk, foliage)
}

// --- geometry (local space, y = 0 at the ground) --------------------------

/** A box translated so its centre sits at (x, y, z). The streetFurniture.ts helper. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/** The bench's metal skeleton: four legs and two back uprights, merged to one draw. */
function benchFrameGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [0.8, -0.8]) {
    for (const sz of [0.16, -0.16]) parts.push(box(0.07, 0.45, 0.07, sx, 0.225, sz)) // legs
    parts.push(box(0.07, 0.55, 0.07, sx, 0.725, 0.18)) // back upright
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

// --- materials (fresh per build, so teardown disposes them cleanly) --------

/** A flat-shaded matte solid in the given colour. */
const matte = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0.0 })
