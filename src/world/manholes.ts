import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Manhole covers dotted down the middle of the streets.
 *
 * OSM tags them as `man_made=manhole`, but only a handful of cities bother, and
 * the ones that do map a street corner or two — never the whole run. So this is
 * procedural: walk each road's centreline and drop a round iron cover every
 * 18-30m, the way the nitro bottles are scattered — spaced out, and never two in
 * one spot.
 *
 * Bridge and tunnel roads are skipped. Their polyline points are the deck's, not
 * the ground's: a cover dropped on a bridge road sits in mid-air above the water,
 * and one on a tunnel road sits on the roof of the tunnel, out in the open where
 * the tunnel is supposed to be buried.
 */

/** Nearest and furthest a cover sits from the last one down the same road. */
const MIN_GAP = 18
const MAX_GAP = 30
/**
 * No two covers closer than this, across the whole city, in metres.
 *
 * Roads share their end vertices at junctions, so two streets walking out of the
 * same corner would each drop a cover a few metres in — and at a crossroads four
 * of them pile into one puddle of iron. This is smaller than MIN_GAP, so it never
 * touches the covers spaced out along a single road; it only weeds the duplicates
 * where roads meet.
 */
const DEDUP_MIN = 8
/**
 * A ceiling on how many the city gets. One instanced draw swallows any number
 * cheaply, but a metropolis of dense streets would still spend the memory on tens
 * of thousands of covers nobody drives over; cap it and thin evenly (below).
 */
const MAX_COVERS = 6000

const COVER_R = 0.34 // ~0.68m across — the size of a real cast-iron cover
const COVER_SIDES = 12 // low-poly disc: a dodecagon reads as round and stays cheap
const COVER_H = 0.06 // a short flat disc, not a drum
const IRON = 0x3a3d42 // dark iron grey

/**
 * The road ribbon sits this far above the ground (roads.ts ROAD_Y_OFFSET, which
 * is module-private there). A cover has to clear that surface, or it fights the
 * tarmac for the same pixels and flickers.
 */
const ROAD_SURFACE = 0.15
/** Lift the disc's centre a touch past the tarmac so its top stands a few cm proud. */
const LIFT = 0.02

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Round low-poly iron covers scattered along every drivable road's centreline.
 *
 * Returns a single InstancedMesh — one draw call for every manhole in the city.
 * Its material is a `MeshStandardMaterial` so the neon theme can flip it to a
 * glowing wireframe like the other instanced road furniture; per-instance shade
 * variety goes through `setColorAt`, never `vertexColors` (a Box/Cylinder has no
 * colour attribute, so `vertexColors: true` would feed the shader zeroes and
 * every cover would render black).
 *
 * @param rand a 0..1 source; defaults to `Math.random`. Tests pass a fixed one
 *   to make the layout deterministic.
 */
export function buildManholes(
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): THREE.InstancedMesh {
  const spots = dedupe(collectSpots(roads, rand))
  const kept = subsample(spots, MAX_COVERS)

  const geo = new THREE.CylinderGeometry(COVER_R, COVER_R, COVER_H, COVER_SIDES)
  const mat = new THREE.MeshStandardMaterial({
    color: IRON,
    flatShading: true,
    metalness: 0.55,
    roughness: 0.7,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, kept.length)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const col = new THREE.Color()
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i]
    // Sit the cover on the road surface (which follows the terrain), a hair proud.
    pos.set(s.x, provider.heightAt(s.x, s.z) + ROAD_SURFACE + LIFT, s.z)
    q.setFromAxisAngle(UP, rand() * Math.PI * 2) // spin each one so the facets don't line up
    mesh.setMatrixAt(i, m.compose(pos, q, one))
    // A little brightness variety around the base iron so a street of them does
    // not read as one stamp repeated. instanceColor multiplies the material
    // colour, so this is a scalar near white, not a fresh colour.
    col.setScalar(0.82 + rand() * 0.32)
    mesh.setColorAt(i, col)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  // frustumCulled stays true (the default): the covers never move, so three's
  // one-shot InstancedMesh bounding sphere — unioned over every instance — stays
  // correct for the life of the batch. (The cull-blink gotcha is about instances
  // that MOVE after that sphere is baked.)
  return mesh
}

/** Every candidate spot down every drivable road, before deduping. */
function collectSpots(roads: Road[], rand: () => number): Vec2[] {
  const out: Vec2[] = []
  const gap = (): number => MIN_GAP + rand() * (MAX_GAP - MIN_GAP)
  for (const road of roads) {
    if (road.bridge || road.tunnel) continue // deck points, not ground points
    const pts = road.points
    if (pts.length < 2) continue
    // Distance still to travel before the next cover. Starting a whole gap in
    // (rather than at the first vertex) keeps covers off the junctions where
    // roads meet, and staggers where each road's run begins.
    let carry = gap()
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) continue
      const ux = dx / len
      const uz = dz / len
      let d = carry
      for (; d < len; d += gap()) out.push({ x: a.x + ux * d, z: a.z + uz * d })
      carry = d - len // carry the overshoot into the next segment
    }
  }
  return out
}

/**
 * Drop any spot within DEDUP_MIN of one already kept, so no two covers share a
 * place (nor crowd one at a junction). A spatial hash keyed on DEDUP_MIN cells
 * keeps it to a 3×3-cell neighbour check per spot rather than an all-pairs scan.
 */
function dedupe(spots: Vec2[]): Vec2[] {
  const cell = DEDUP_MIN
  const min2 = DEDUP_MIN * DEDUP_MIN
  const grid = new Map<string, Vec2[]>()
  const kept: Vec2[] = []
  for (const s of spots) {
    const cx = Math.floor(s.x / cell)
    const cz = Math.floor(s.z / cell)
    let clash = false
    for (let gx = cx - 1; gx <= cx + 1 && !clash; gx++) {
      for (let gz = cz - 1; gz <= cz + 1 && !clash; gz++) {
        const bucket = grid.get(`${gx},${gz}`)
        if (!bucket) continue
        for (const q of bucket) {
          const ex = q.x - s.x
          const ez = q.z - s.z
          if (ex * ex + ez * ez < min2) {
            clash = true
            break
          }
        }
      }
    }
    if (clash) continue
    const key = `${cx},${cz}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(s)
    else grid.set(key, [s])
    kept.push(s)
  }
  return kept
}

/** Keep at most `max` items, evenly spaced through the array (as roadDetail does). */
function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const stride = items.length / max
  const out: T[] = []
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += stride) out.push(items[Math.floor(i)])
  return out
}
