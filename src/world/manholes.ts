import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Manhole covers dotted down the middle of the streets.
 *
 * OSM tags them as `man_made=manhole`, but only a handful of cities bother, and
 * the ones that do map a street corner or two — never the whole run. So this is
 * procedural: walk each drivable road's centreline and drop a round iron cover
 * every 90-180m — spaced well out, nudged off to one side, and never two in one
 * spot.
 *
 * Bridge, tunnel and footpath roads are skipped. Their polyline points are the deck's, not
 * the ground's: a cover dropped on a bridge road sits in mid-air above the water,
 * and one on a tunnel road sits on the roof of the tunnel, out in the open where
 * the tunnel is supposed to be buried.
 */

/** Nearest and furthest a cover sits from the last one down the same road. */
const MIN_GAP = 90
const MAX_GAP = 180
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

const COVER_R = 0.6 // ~1.2m across — a big cast-iron cover you can't miss
const SEGMENTS = 16 // low-poly, but round enough that the dome doesn't read as a gem
const DOME_RISE = 0.17 // how far the dome stands proud of the tarmac — convex, not a puck
/** How far off the centreline a cover sits, metres — into a lane, not dead centre. */
const OFF_CENTRE_MIN = 1.4
const OFF_CENTRE_MAX = 2.8
// Worn iron a shade off the tarmac (roads are 0x5b5c62), so a cover reads as a
// lid set into the road rather than a black disc punched through it.
const IRON = 0x55565d

/**
 * Four cast fixings around the rim, at N/E/S/W — the bolts that hold a real cover
 * down. Little low-poly studs standing proud of the lid, baked into the SHARED
 * dome geometry so they ride every instance for free (zero extra draw calls).
 */
const BOLT_R = 0.05 // stud radius, ~10cm across
const BOLT_H = 0.1 // how tall the stud stands off the road
const BOLT_RING = 0.52 // how far from centre the ring of four sits — just inside the rim
const BOLT_SIDES = 6 // low-poly studs, in keeping with the 16-facet dome

/**
 * A raised cross-hatch of ribs over the lid's crown — the waffle of cast bars you
 * see on real ironwork (there for grip). The user asked for perpendicular stripes,
 * so it's two sets of low bars at right angles. Like the bolts, they're baked into
 * the SHARED dome geometry, so they ride every instance for free — no per-cover
 * mesh, no second draw. Each bar runs from the road surface up through the dome and
 * stands a hair proud of the crown: its foot is buried in the tarmac and its flanks
 * in the dome, so it *cuts through* the opaque dome rather than resting on it —
 * solid intersection, never coplanar, so nothing z-fights.
 */
const STRIPE_W = 0.07 // rib width, ~14cm — a chunky cast bar, not a scratch
const STRIPE_SPAN = 0.8 // rib length; ±0.4 keeps even the outer bars' corners inside the bolt ring
const STRIPE_LIFT = 0.02 // how far the ribs' flat crown stands proud of the dome apex (DOME_RISE)
const STRIPE_OFFSETS = [-0.26, 0, 0.26] // three bars each way — a 3×3 waffle across the crown

/**
 * A deterministic ~1-in-8 of the covers sit *ajar*: shoved a touch off their seat
 * and tipped a few degrees, as if a wheel or a work crew left the lid half-open.
 * The nudge is small (stays on the road), the tilt is a few degrees; both come off
 * the existing per-instance `rand`, so the same lids are ajar on every reload.
 */
const AJAR_CHANCE = 0.125 // ~1 in 8
const AJAR_TILT_MIN = 0.09 // radians (~5°) — the gentlest lean that still reads as tipped
const AJAR_TILT_MAX = 0.22 // radians (~13°) — lifted at one edge, not flipped over
const AJAR_NUDGE_MAX = 0.18 // metres it slides off-seat — off-centre, never flung off the road

/**
 * The road ribbon sits this far above the ground (roads.ts ROAD_Y_OFFSET, which
 * is module-private there). The cover's equator sits on that surface and the
 * dome curves up out of it; the lower half is buried under the opaque tarmac.
 */
const ROAD_SURFACE = 0.15

const UP = new THREE.Vector3(0, 1, 0)

/** World (x,z) of an ajar cover — a spot a wheel can drop into (vehicle/pothole.ts). */
export interface OpenManhole {
  x: number
  z: number
}

/**
 * The ajar covers a manhole mesh surfaced on its `userData`, or an empty list.
 * A tiny typed reader so callers don't reach into `userData` untyped.
 */
export function openManholesOf(mesh: THREE.InstancedMesh): OpenManhole[] {
  const open = mesh.userData.openManholes
  return Array.isArray(open) ? (open as OpenManhole[]) : []
}

/**
 * Round low-poly iron covers scattered along every drivable road's centreline.
 *
 * Returns a single InstancedMesh — one draw call for every manhole in the city.
 * The four rim fixings are baked into the shared dome geometry, so they ride that
 * same draw for free; a deterministic ~1 in 8 lids sit ajar (tipped and nudged).
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

  const geo = coverGeo()
  const mat = new THREE.MeshStandardMaterial({
    color: IRON,
    flatShading: true,
    metalness: 0.3, // matte, so it tracks its own grey instead of flashing the sky dark or bright
    roughness: 0.85,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, kept.length)

  // World (x,z) of every lid left ajar — the ones a wheel can drop into. Surfaced
  // on the mesh so the car physics (vehicle/pothole.ts) can tilt over them; the
  // list is built in the same pass as the matrices, off the same `rand`, so the
  // covers that dip are exactly the ones that LOOK open.
  const open: OpenManhole[] = []

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const tiltQ = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const col = new THREE.Color()
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i]
    // Equator on the road surface (which follows the terrain); the dome pokes up.
    pos.set(s.x, provider.heightAt(s.x, s.z) + ROAD_SURFACE, s.z)
    q.setFromAxisAngle(UP, rand() * Math.PI * 2) // spin each one so the facets don't line up
    // ~1 in 8 sit ajar: tip the lid a few degrees about a horizontal axis and slide
    // it off-seat the same way, so one edge lifts as if it were left half-open.
    if (rand() < AJAR_CHANCE) {
      const dir = rand() * Math.PI * 2 // which way it lists
      const c = Math.cos(dir)
      const sn = Math.sin(dir)
      axis.set(-sn, 0, c) // horizontal axis square to `dir`, so the rim rises on the `dir` side
      tiltQ.setFromAxisAngle(axis, AJAR_TILT_MIN + rand() * (AJAR_TILT_MAX - AJAR_TILT_MIN))
      q.premultiply(tiltQ) // tip in world space, on top of the spin
      const nudge = rand() * AJAR_NUDGE_MAX // shoved off-seat, but stays on the road
      pos.x += c * nudge
      pos.z += sn * nudge
      open.push({ x: pos.x, z: pos.z })
    }
    mesh.setMatrixAt(i, m.compose(pos, q, one))
    // A little brightness variety around the base iron so a street of them does
    // not read as one stamp repeated. instanceColor multiplies the material
    // colour, so this is a scalar near white, not a fresh colour.
    col.setScalar(0.9 + rand() * 0.2)
    mesh.setColorAt(i, col)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.userData.openManholes = open
  // frustumCulled stays true (the default): the covers never move, so three's
  // one-shot InstancedMesh bounding sphere — unioned over every instance — stays
  // correct for the life of the batch. (The cull-blink gotcha is about instances
  // that MOVE after that sphere is baked.)
  return mesh
}

/**
 * The shared cover geometry: a shallow convex dome with four rim fixings baked in.
 *
 * The dome is a sphere squashed to a lens — its equator sits on the road and the
 * top curves up DOME_RISE proud; the bottom half is under the tarmac. The four
 * studs stand at N/E/S/W just inside the rim, straddling the dome flank so they
 * read as cast bolts, and a perpendicular cross-hatch of ribs sits over the crown.
 * Merged into one geometry, so every instance draws the lid *and* its fixings *and*
 * its waffle in a single instanced draw — no second batch for any of it.
 */
function coverGeo(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(COVER_R, SEGMENTS, 6)
  dome.scale(1, DOME_RISE / COVER_R, 1)
  const parts: THREE.BufferGeometry[] = [dome]
  for (const [bx, bz] of [[BOLT_RING, 0], [-BOLT_RING, 0], [0, BOLT_RING], [0, -BOLT_RING]]) {
    const bolt = new THREE.CylinderGeometry(BOLT_R, BOLT_R, BOLT_H, BOLT_SIDES)
    bolt.translate(bx, BOLT_H / 2, bz) // stand it on the road surface, proud of the flank
    parts.push(bolt)
  }
  // The waffle: two passes of bars at right angles. Each bar reaches from the road
  // surface (y=0) up to STRIPE_TOP, so its foot buries in the tarmac and its flanks
  // in the dome; only the flat crown, a hair above the apex, shows. The X-pass bars
  // run along X, spaced out along Z (and vice versa), overlapping at the crossings.
  const stripeTop = DOME_RISE + STRIPE_LIFT
  for (const off of STRIPE_OFFSETS) {
    const alongX = new THREE.BoxGeometry(STRIPE_SPAN, stripeTop, STRIPE_W)
    alongX.translate(0, stripeTop / 2, off)
    const alongZ = new THREE.BoxGeometry(STRIPE_W, stripeTop, STRIPE_SPAN)
    alongZ.translate(off, stripeTop / 2, 0)
    parts.push(alongX, alongZ)
  }
  return mergeGeometries(parts)
}

/** Every candidate spot down every drivable road, before deduping. */
function collectSpots(roads: Road[], rand: () => number): Vec2[] {
  const out: Vec2[] = []
  const gap = (): number => MIN_GAP + rand() * (MAX_GAP - MIN_GAP)
  for (const road of roads) {
    if (road.bridge || road.tunnel) continue // deck points, not ground points
    if (road.kind === 'path') continue // footways and cycle paths carry no road manholes
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
      const px = -uz // perpendicular to the road, to sit a cover off the centreline
      const pz = ux
      let d = carry
      for (; d < len; d += gap()) {
        const off = (OFF_CENTRE_MIN + rand() * (OFF_CENTRE_MAX - OFF_CENTRE_MIN)) * (rand() < 0.5 ? -1 : 1)
        out.push({ x: a.x + ux * d + px * off, z: a.z + uz * d + pz * off })
      }
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
