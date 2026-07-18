import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roomAt } from './area'

const WATER_OFFSET = 0.2 // sit just above the terrain basin
/**
 * How far the water's edge skirt hangs below the ground at the shoreline, metres.
 * A single flat surface over a sloping bank floats where the bank drops below its
 * level — you see daylight under the water's edge. A vertical skirt from the
 * perimeter down past the ground plugs that gap so the water meets the shore.
 */
const SKIRT_DROP = 1.5
/** How far the stone embankment's dry lip stands above the waterline, metres. */
const EMB_LIP = 0.5
/**
 * Embankment stone — a warm grey tuned to sit with the grass and tarmac (NOT red
 * brick), with a darker band below the waterline reading as a wet tide-mark, so a
 * body of water reads as a built, edged channel instead of bare water just sitting
 * there. Flat vertex colours, no texture — one extra mesh per body, cheap.
 */
const STONE_DRY = 0x8c857a
const STONE_WET = 0x5f5a52

/**
 * The waterfront railing: a see-through balustrade seated on the embankment's dry
 * lip (`level + EMB_LIP`) — thin plumb posts a few metres apart tied by a single
 * top rail spanning between them, the same idea as the bridge balustrade but run
 * along the shore. RAIL_T is how thick one bar reads: a post's square footprint
 * and the rail's section are both this, kept thin so daylight finds the gaps.
 * RAIL_H is how tall the posts stand above the lip — a low quayside rail, not a
 * fence. RAIL_COLOR is a muted cool metal-grey that sits with the stone.
 */
const RAIL_COLOR = 0x77797d
const RAIL_H = 0.9
const RAIL_T = 0.08
/** How far apart the posts march along the shore, metres. */
const RAIL_POST_SPACING = 4
/**
 * Bounds on which shores get railed and how much rail a body may cost. A tiny
 * pond ringed by a fence looks silly, so bodies under RAIL_MIN_PERIMETER get
 * none. A sprawling river outline (the Nile's runs kilometres, most of it off the
 * map) would spawn thousands of posts, so the spacing is widened for a long shore
 * to hold each body under RAIL_MAX_POSTS: the count stays bounded and the rhythm
 * stays even all the way round instead of stopping dead partway.
 */
const RAIL_MIN_PERIMETER = 120
const RAIL_MAX_POSTS = 240

/** Half the map, in metres — RADIUS in `main.ts`, and all the ground there is. */
const MAP_HALF = 1000
/** How finely to sample a water body's bed. */
const PROBE_STEP = 40
/**
 * Which of the sampled bed heights to float the water at, low end first.
 *
 * Not the minimum: one stray sample in a dredged channel or a DEM artefact
 * would drop the whole surface below the bed and bury it. Not the middle
 * either, or the water sits over its own banks. A low quantile is the river.
 */
const BED_QUANTILE = 0.15

/**
 * The level to float a water body at: the bed it sits in, HERE.
 *
 * Sampling the centroid looks right for a pond and wrong for a river — a
 * winding river's centroid often falls outside the polygon entirely, on a bank
 * or a hill, and the whole surface then hangs in the air at that height.
 *
 * The lowest point on the outline was the answer to that, and it is wrong for
 * the same reason in reverse: an outline is not local. The Nile's polygon is 73
 * square kilometres and runs far past the map, so its lowest rim point is miles
 * downstream and well below the river beside Cairo — measured, not guessed:
 * level 8.28 against a bed of 9.4 to 41.7 inside the map. The water sat under
 * the ground for the whole city, and any boat on it sailed over the grass.
 *
 * So: sample the bed inside the outline and inside the map, and take a low
 * quantile of what is actually there.
 */
export function waterLevel(ring: Vec2[], provider: ElevationProvider): number {
  const bed: number[] = []
  for (let x = -MAP_HALF; x <= MAP_HALF; x += PROBE_STEP) {
    for (let z = -MAP_HALF; z <= MAP_HALF; z += PROBE_STEP) {
      if (roomAt(ring, x, z) > 0) bed.push(provider.heightAt(x, z))
    }
  }
  if (!bed.length) {
    // None of it is on the map — a pond smaller than the sampling step, or water
    // that only clips a corner. Its own outline is all there is to go on.
    let low = Infinity
    for (const p of ring) low = Math.min(low, provider.heightAt(p.x, p.z))
    return low + WATER_OFFSET
  }
  bed.sort((a, b) => a - b)
  return bed[Math.floor(bed.length * BED_QUANTILE)] + WATER_OFFSET
}

/**
 * One thin box — a bar — written straight into a triangle soup: a square section
 * `2*half` on a side, running in plan from `a` to `b`, flat bottom at `yBot` and
 * flat top at `yTop`. The railing's posts and rails are all just bars, so they
 * share this one primitive and land in the same buffer. The rail mesh is drawn
 * double-sided, so winding is not tracked — flat shading lights whichever face
 * turns to the sun. Six quads, twelve triangles per bar.
 */
function emitBar(out: number[], a: Vec2, b: Vec2, half: number, yBot: number, yTop: number): void {
  // Unit perpendicular to the bar in plan, scaled to the half-thickness: the two
  // long faces sit this far to either side of the a→b centre line.
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const nx = (-dz / len) * half
  const nz = (dx / len) * half
  const am = { x: a.x - nx, z: a.z - nz }
  const ap = { x: a.x + nx, z: a.z + nz }
  const bm = { x: b.x - nx, z: b.z - nz }
  const bp = { x: b.x + nx, z: b.z + nz }
  const quad = (
    p: Vec2, py: number, q: Vec2, qy: number,
    r: Vec2, ry: number, s: Vec2, sy: number,
  ): void => {
    out.push(p.x, py, p.z, q.x, qy, q.z, r.x, ry, r.z)
    out.push(p.x, py, p.z, r.x, ry, r.z, s.x, sy, s.z)
  }
  quad(am, yBot, ap, yBot, ap, yTop, am, yTop) // end cap at a
  quad(bm, yBot, bp, yBot, bp, yTop, bm, yTop) // end cap at b
  quad(am, yBot, am, yTop, bm, yTop, bm, yBot) // minus-side face
  quad(ap, yBot, ap, yTop, bp, yTop, bp, yBot) // plus-side face
  quad(am, yTop, ap, yTop, bp, yTop, bm, yTop) // top face
  quad(am, yBot, ap, yBot, bp, yBot, bm, yBot) // bottom face
}

/**
 * A see-through balustrade run along one water body's perimeter, seated on the
 * embankment's dry lip at `baseY`: plumb posts a stride apart, tied by a level
 * top rail. Everything is a thin bar pushed into `out`, so a body's whole railing
 * — and, since all bodies share the one buffer, every railing — merges into a
 * single mesh and a single draw.
 *
 * Posts are walked out by DISTANCE round the loop, not one per ring vertex: a
 * shore outline can be thousands of tiny kinked edges, and posts-per-vertex would
 * bunch or thin with the mesh instead of the eye. The spacing is widened just
 * enough that even a kilometres-long river outline stays under RAIL_MAX_POSTS, so
 * the triangle count is bounded (≈ 24 triangles per post: a post bar and the rail
 * bar reaching to the next post) and stays even all the way round.
 */
function emitRailing(out: number[], ring: Vec2[], baseY: number): void {
  // Perimeter length, to decide whether this body is worth railing and how far
  // apart to space the posts.
  let perim = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    perim += Math.hypot(b.x - a.x, b.z - a.z)
  }
  if (perim < RAIL_MIN_PERIMETER) return // a small pond — a rail round it looks silly

  // Even spacing round the closed loop, widened only when a long shore would
  // otherwise blow past the post budget.
  const spacing = Math.max(RAIL_POST_SPACING, perim / RAIL_MAX_POSTS)

  // Walk the loop by arc length, dropping a post point ON the polyline every
  // `spacing` so the posts (and the rail spanning them) hug the shore. `next`
  // carries across segment boundaries, so the rhythm is even over the whole
  // perimeter rather than restarting at every ring vertex.
  const posts: Vec2[] = []
  let dist = 0
  let next = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1
    while (next < dist + segLen) {
      const f = (next - dist) / segLen
      posts.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f })
      next += spacing
    }
    dist += segLen
  }
  if (posts.length < 2) return

  const half = RAIL_T / 2
  const railY = baseY + RAIL_H
  for (let i = 0; i < posts.length; i++) {
    const c = posts[i]
    const d = posts[(i + 1) % posts.length] // next post, wrapping to close the loop
    // Top rail: a level bar from this post to the next, capping them flush.
    emitBar(out, c, d, half, railY - RAIL_T, railY)
    // Post: a plumb bar from the lip up to the rail, its tiny footprint aligned
    // along the rail so post and rail read as one joint.
    const tl = Math.hypot(d.x - c.x, d.z - c.z) || 1
    const hx = ((d.x - c.x) / tl) * half
    const hz = ((d.z - c.z) / tl) * half
    emitBar(out, { x: c.x - hx, z: c.z - hz }, { x: c.x + hx, z: c.z + hz }, half, baseY, railY)
  }
}

/** Flat filled polygons for water bodies, placed at each body's terrain level. */
export function buildWater(water: Vec2[][], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f6db0,
    flatShading: true,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  })
  // The embankment: opaque stone, flat vertex colours (dry lip / wet tide-mark).
  const emb = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })
  const dry = new THREE.Color(STONE_DRY)
  const wet = new THREE.Color(STONE_WET)
  // The waterfront railing: one flat-coloured metal, double-sided so bar winding
  // needn't be tracked. Every body's balustrade feeds this one buffer, so the
  // whole shoreline railing is a single mesh and a single draw.
  const railMat = new THREE.MeshStandardMaterial({
    color: RAIL_COLOR,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const railPos: number[] = []

  for (const ring of water) {
    if (ring.length < 3) continue
    const level = waterLevel(ring, provider)

    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2) // XY shape → XZ plane, z preserved (no mirror)
    geo.translate(0, level, 0)
    group.add(new THREE.Mesh(geo, mat))

    // A stone embankment around the perimeter: a low DRY lip above the waterline,
    // then a WET wall down past the ground so a surface over a sloping bank meets a
    // built edge instead of floating (bare water used to just "stand"). Two flat-
    // coloured bands — dry stone above the waterline, a darker wet band below it as
    // the tide-mark. Where the ground is already above the water it tucks under.
    const pos: number[] = []
    const col: number[] = []
    const push = (x: number, y: number, z: number, c: THREE.Color): void => {
      pos.push(x, y, z)
      col.push(c.r, c.g, c.b)
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const top = level + EMB_LIP
      const ab = Math.min(level, provider.heightAt(a.x, a.z)) - SKIRT_DROP
      const bb = Math.min(level, provider.heightAt(b.x, b.z)) - SKIRT_DROP
      // dry lip: waterline up to the top edge
      push(a.x, top, a.z, dry); push(b.x, top, b.z, dry); push(a.x, level, a.z, dry)
      push(b.x, top, b.z, dry); push(b.x, level, b.z, dry); push(a.x, level, a.z, dry)
      // wet wall: waterline down past the ground
      push(a.x, level, a.z, wet); push(b.x, level, b.z, wet); push(a.x, ab, a.z, wet)
      push(b.x, level, b.z, wet); push(b.x, bb, b.z, wet); push(a.x, ab, a.z, wet)
    }
    const embGeo = new THREE.BufferGeometry()
    embGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    embGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
    embGeo.computeVertexNormals()
    group.add(new THREE.Mesh(embGeo, emb))

    // A low balustrade seated on the dry lip's top edge (`level + EMB_LIP`): posts
    // spaced by distance and a top rail, all bars appended to the shared buffer.
    emitRailing(railPos, ring, level + EMB_LIP)
  }
  // One merged mesh for every water body's railing — a single draw for the lot.
  if (railPos.length) {
    const railGeo = new THREE.BufferGeometry()
    railGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(railPos), 3))
    railGeo.computeVertexNormals()
    group.add(new THREE.Mesh(railGeo, railMat))
  }
  return group
}
