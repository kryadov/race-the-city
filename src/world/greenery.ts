import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'
import { season, type Season } from './season'

const MAX_TREES = 600
const TREE_AREA = 550 // one scattered tree per ~this many m² of green
const MAX_PER_AREA = 60 // cap scatter per polygon
const RNG_SEED = 0x1a2b3c4d // fixed seed → identical trees on every browser and reload

// Forest fill — the dense woodland inside `natural=wood` / `landuse=forest`
// polygons, kept apart from the sparse park scatter above so a лесомассив reads
// as a solid canopy without ballooning the tree count.
const FOREST_GRID_M = 9 // a candidate every ~9m (≈one per 81 m²) → a closed canopy
const MAX_FOREST_TREES = 2000 // global budget for all forest fill: instanced, so cheap
const FOREST_CANDIDATE_CAP = 24000 // bound the point-in-polygon scan for a giant tract
const FOREST_SEED = 0x51e2d3c4 // its own seed → forest fill never perturbs the scatter

/** Deterministic PRNG (mulberry32). Using this instead of Math.random keeps the
 * scattered-tree count and layout identical across browsers — Math.random-based
 * rejection sampling otherwise produced a different tree count on each load. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Low-poly instanced trees scattered in the green areas (the green ground tint
 * itself is painted onto the ground mesh in buildGround).
 *
 * The crowns are tinted for the season: summer green, autumn's yellow-orange-red,
 * a scatter of spring blossom, winter's drained grey-green — all a per-instance
 * colour swap, no extra geometry or draw calls. See season.ts for the palette.
 */
/** @param lat the city's latitude — decides which trees grow here *and*, via its
 * sign, which hemisphere's calendar the seasons follow. */
/** @param forests wooded polygons (`world.forests`) to pack with trees. Optional
 * and empty by default so the park scatter, mapped trees and seasonal crowns stay
 * exactly as before when a caller passes only green + trees. */
/**
 * @returns the greenery `object` to add to the scene, plus a `perches` list — one
 * world-space spot per rendered tree where a bird can sit IN that tree's crown.
 * The flock (birds.ts) takes these instead of the bare tree positions, so a bird
 * lands at each tree's real crown height rather than a fixed guess that floated it
 * above the short trees.
 */
/** How far a tree keeps from a statue/fountain, so a monument isn't planted inside a canopy. */
export const STATUE_CLEAR = 4

/** Drop any spot within `clear` metres of a prop point — keeps trees off the monuments. */
export function clearOfProps(spots: Vec2[], props: Vec2[], clear = STATUE_CLEAR): Vec2[] {
  if (!props.length) return spots
  const c2 = clear * clear
  return spots.filter((s) => props.every((p) => (s.x - p.x) ** 2 + (s.z - p.z) ** 2 >= c2))
}

export function buildGreenery(green: Vec2[][], trees: Vec2[], provider: ElevationProvider, lat: number, forests: Vec2[][] = [], props: Vec2[] = []): { object: THREE.Object3D; perches: TreePerch[] } {
  const group = new THREE.Group()
  const szn = season(new Date(), lat)
  const rng = makeRng(RNG_SEED)
  const perches: TreePerch[] = []
  const spots = clearOfProps(collectTreeSpots(green, trees, rng), props)
  if (spots.length) {
    const t = buildTrees(spots, provider, rng, lat, szn)
    group.add(t.object)
    perches.push(...t.perches)
  }
  // A second, far denser pass fills the wooded polygons. It runs on its own seed,
  // so the scatter above is untouched — the same instanced meshes and seasonal
  // palette, just packed inside each wood. Capped + subsampled (see below) so a
  // big forest costs a few thousand instanced trees, never tens of thousands.
  if (forests.length) {
    const frng = makeRng(FOREST_SEED)
    const fspots = clearOfProps(collectForestSpots(forests, frng), props)
    if (fspots.length) {
      const t = buildTrees(fspots, provider, frng, lat, szn)
      group.add(t.object)
      perches.push(...t.perches)
    }
  }
  return { object: group, perches }
}

/**
 * A world-space spot a bird can perch in a tree's crown: the tree's (x, z) and a
 * y at its foliage centre AT THE SCALE this tree was rendered with. Because it is
 * captured from the very `s` used to draw the tree — not a separate rng replay —
 * a short tree seats a bird low and a tall one high, and a reload reproduces both
 * the tree and its perch identically. Threaded out of buildGreenery to the flock.
 */
export interface TreePerch { x: number; z: number; y: number }

/** Explicit tree points plus a capped scatter inside green polygons. */
function collectTreeSpots(green: Vec2[][], trees: Vec2[], rng: () => number): Vec2[] {
  const spots: Vec2[] = trees.slice(0, MAX_TREES)
  for (const ring of green) {
    if (spots.length >= MAX_TREES || ring.length < 3) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const area = (maxX - minX) * (maxZ - minZ)
    const want = Math.min(MAX_PER_AREA, Math.floor(area / TREE_AREA))
    for (let i = 0; i < want * 2 && spots.length < MAX_TREES; i++) {
      const x = minX + rng() * (maxX - minX)
      const z = minZ + rng() * (maxZ - minZ)
      if (pointInPolygon(x, z, ring)) spots.push({ x, z })
    }
  }
  return spots
}

/**
 * Dense, deterministic fill of the wooded polygons.
 *
 * A jittered grid clipped to each ring: a candidate every FOREST_GRID_M, nudged
 * off its lattice so rows don't line up into visible files of trees, then
 * point-in-polygon so none stray outside the wood. Bounded twice over — the scan
 * stops at FOREST_CANDIDATE_CAP so even a square-kilometre tract is cheap to
 * sample, and the result is strided down to MAX_FOREST_TREES so every forest on
 * the map together stays a couple of thousand instanced trees. The stride thins
 * evenly, so a huge wood reads as sparser rather than clipped to one corner.
 */
export function collectForestSpots(forests: Vec2[][], rng: () => number): Vec2[] {
  const spots: Vec2[] = []
  for (const ring of forests) {
    if (ring.length < 3 || spots.length >= FOREST_CANDIDATE_CAP) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    for (let z = minZ; z < maxZ && spots.length < FOREST_CANDIDATE_CAP; z += FOREST_GRID_M) {
      for (let x = minX; x < maxX && spots.length < FOREST_CANDIDATE_CAP; x += FOREST_GRID_M) {
        const jx = x + (rng() - 0.5) * FOREST_GRID_M
        const jz = z + (rng() - 0.5) * FOREST_GRID_M
        if (pointInPolygon(jx, jz, ring)) spots.push({ x: jx, z: jz })
      }
    }
  }
  return subsample(spots, MAX_FOREST_TREES)
}

/** Keep at most `max`, evenly strided through the array — the props/manholes
 * thinning idiom, so the forest budget holds however big the wood is. */
function subsample(items: Vec2[], max: number): Vec2[] {
  if (items.length <= max) return items
  const stride = items.length / max
  const out: Vec2[] = []
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += stride) out.push(items[Math.floor(i)])
  return out
}

/** The forest fill's global tree budget — exported for the count-cap test. */
export const FOREST_TREE_CAP = MAX_FOREST_TREES

interface TreeVariant {
  name: string
  foliage: () => THREE.BufferGeometry
  color: number
  folY: number // foliage centre height factor (× scale) above ground
  trunk?: () => THREE.BufferGeometry // defaults to the stubby temperate trunk
  deciduous?: boolean // sheds/turns with the season; the evergreens keep their green
}

/** How many fronds a palm carries. Enough to read as a crown, few enough to be cheap. */
const FRONDS = 8

/**
 * A palm's crown: fronds radiating from the top of the trunk and drooping.
 *
 * It was a squashed ball — which is a round tree that has been sat on, and read
 * as exactly that: an ordinary tree, in Cairo. A palm is its silhouette, and its
 * silhouette is separate leaves with sky between them.
 */
export function frondGeo(radius: number): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  for (let i = 0; i < FRONDS; i++) {
    // A long tapered blade lying along +x, springing from the origin.
    const blade = new THREE.ConeGeometry(radius * 0.22, radius, 4)
    blade.scale(1, 1, 0.35) // flat: a leaf, not a spike
    blade.rotateZ(-Math.PI / 2)
    blade.translate(radius / 2, 0, 0)
    blade.rotateZ(-0.3 - (i % 2) * 0.22) // droop, alternating so they don't fuse into a disc
    blade.rotateY((i / FRONDS) * Math.PI * 2)
    blades.push(blade)
  }
  return mergeGeometries(blades)
}
const palmTrunk = (h: number) => (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(0.16, 0.26, h, 5)
  g.translate(0, h / 2 - 1, 0) // the shared trunk is 2 tall and centred at y=1
  return g
}

// Distinct crown shapes for variety; folY = 2 (trunk top) + half the crown height.
const CONIFER: TreeVariant = { name: 'conifer', foliage: () => new THREE.ConeGeometry(1.5, 3.4, 6), color: 0x3f7a3a, folY: 3.7 }
const BROADLEAF: TreeVariant = { name: 'broadleaf', foliage: () => new THREE.IcosahedronGeometry(1.6, 0), color: 0x4f8a3a, folY: 3.6, deciduous: true }
const SPRUCE: TreeVariant = { name: 'spruce', foliage: () => new THREE.ConeGeometry(1.1, 4.8, 6), color: 0x5c8f47, folY: 4.4 }
const PALM_TALL: TreeVariant = { name: 'palm', foliage: () => frondGeo(2.3), color: 0x4e8f42, folY: 5.2, trunk: palmTrunk(6.4) }
const PALM_SHORT: TreeVariant = { name: 'palm', foliage: () => frondGeo(1.9), color: 0x5c9a48, folY: 3.9, trunk: palmTrunk(5.0) }

/**
 * Which trees grow here, by latitude. Conifers in Monaco read as wrong — but so
 * would pure palms, since the Mediterranean has both, so the middle band mixes
 * them and the picker's random bucketing does the rest.
 */
export function variantsFor(lat: number): TreeVariant[] {
  const a = Math.abs(lat)
  if (a <= 38) return [PALM_TALL, PALM_SHORT, BROADLEAF] // subtropics: palms dominate
  if (a <= 48) return [PALM_TALL, BROADLEAF, CONIFER, PALM_SHORT] // Mediterranean: half and half
  return [CONIFER, BROADLEAF, SPRUCE] // north: no palms
}

const UP = new THREE.Vector3(0, 1, 0)

const WHITE = new THREE.Color(0xffffff)

function buildTrees(spots: Vec2[], provider: ElevationProvider, rng: () => number, lat: number, szn: Season): { object: THREE.Object3D; perches: TreePerch[] } {
  const g = new THREE.Group()
  const perches: TreePerch[] = []
  const variants = variantsFor(lat)
  const buckets: Vec2[][] = variants.map(() => [])
  for (const s of spots) buckets[Math.floor(rng() * variants.length)].push(s)

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2, 5)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true })

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const col = new THREE.Color()

  variants.forEach((v, vi) => {
    const pts = buckets[vi]
    if (!pts.length) return
    const n = pts.length
    // One instanced draw per variant either way — a palm just brings its own trunk.
    const trunk = new THREE.InstancedMesh(v.trunk ? v.trunk() : trunkGeo, trunkMat, n)
    const foliage = new THREE.InstancedMesh(
      v.foliage(),
      new THREE.MeshStandardMaterial({ color: v.color, flatShading: true }),
      n,
    )
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rng() * 0.7 // size variety
      const y = provider.heightAt(pts[i].x, pts[i].z)
      q.setFromAxisAngle(UP, rng() * Math.PI * 2) // rotation variety
      scl.set(s, s, s)
      pos.set(pts[i].x, y + s, pts[i].z)
      trunk.setMatrixAt(i, m.compose(pos, q, scl))
      pos.set(pts[i].x, y + v.folY * s, pts[i].z)
      foliage.setMatrixAt(i, m.compose(pos, q, scl))
      // A bird's perch in THIS tree: its crown centre at the very scale it is
      // drawn with (ground + folY*s — the same expression as the foliage above),
      // so the bird sits among these leaves. Captured from this `s`, not a
      // replayed rng, so it is deterministic by construction — a short tree seats
      // the bird low and a tall one high, and no bird floats above a small canopy.
      perches.push({ x: pts[i].x, z: pts[i].z, y: y + v.folY * s })
      // Seasonal crown colour. Deciduous trees turn (and a seeded few blossom in
      // spring); evergreens hold their green but catch a dusting of winter snow.
      // The rng() draws feed off the same fixed seed, so a reload repaints the
      // very same crowns — nothing here reads the wall clock past szn itself.
      let hex = v.color
      if (v.deciduous) {
        const blossom = szn.blossomChance > 0 && rng() < szn.blossomChance
        const r = rng()
        hex = blossom ? szn.blossom : szn.crown(v.color, r)
      }
      col.setHex(hex)
      if (!v.deciduous && szn.snow > 0) col.lerp(WHITE, szn.snow * 0.4)
      col.offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.1)
      foliage.setColorAt(i, col) // shade variety
    }
    trunk.instanceMatrix.needsUpdate = true
    foliage.instanceMatrix.needsUpdate = true
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true
    g.add(trunk, foliage)
  })
  return { object: g, perches }
}
