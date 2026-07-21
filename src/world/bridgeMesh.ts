import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { Deck } from './bridge'
import { offsetsForPolyline, roadWidth, emitRibbon, ribbonMesh } from './roads'

const DECK_COLOR = 0x6e6f77
const RAIL_COLOR = 0x9aa0a8
const PIER_COLOR = 0x7b7d85
const RAIL_H = 1.0
/**
 * The railing is a balustrade of thin bars, not a filled parapet. RAIL_T is how
 * thick a single bar reads — a post's square footprint and a rail's section are
 * both this — kept thin so daylight finds the gaps between the posts. The posts
 * march along the edge every POST_SPACING metres; a top rail caps them flush and
 * a mid rail crosses at MID_FRAC of the height, with air above and below it.
 */
const RAIL_T = 0.1
const POST_SPACING = 2.5
const MID_FRAC = 0.5
const PIER_MIN = 2.0 // don't prop up a deck that is already on the ground
/**
 * The BASE depth of the deck slab — the drop from its drivable top to its
 * underside on a short span. It used to be a single plane — a couple of pixels
 * edge-on — so a bridge seen from the side had no depth at all. Now the deck has
 * a drivable top at the profiled height and an underside at least this far below
 * it, and the piers stop at that underside instead of poking through the top.
 */
const DECK_THICKNESS = 0.6
/**
 * A wide river crossing at that same shallow 0.6m read as a thin sheet floating
 * over the water: 0.6m of depth is nothing seen across a couple of hundred
 * metres. Real viaducts carry a deep girder, so the slab deepens with the span —
 * DECK_DEEPEN_PER_M of extra depth for every metre past DECK_SHALLOW_SPAN, capped
 * at DECK_DEPTH_MAX so it never turns into a wall. Only the underside, fascia and
 * pier tops follow it; the drivable top stays on the profile, so nothing the car
 * (or the deck index in bridge.ts) rides on moves a millimetre.
 */
const DECK_SHALLOW_SPAN = 100
const DECK_DEEPEN_PER_M = 0.02
const DECK_DEPTH_MAX = 3.0
/**
 * Distance between pier bents along the span. A pier under every densified deck
 * point (one every DECK_STEP ≈ 4m) turned a wide crossing into a centipede of
 * thin stilts — most of why the span looked flimsy and afloat. A real viaduct
 * stands on a handful of bents tens of metres apart, so we walk the deck by
 * distance and raise one only this often. Each bent is now a PAIR of piers (one
 * near each deck edge, see PIER_EDGE_FRAC), so the bents are spaced wider than
 * when it was a single centreline pier to keep the overall count viaduct-sparse.
 */
const PIER_SPACING = 50
/**
 * How far each pier stands to the side of the deck centreline, as a fraction of
 * the deck half-width. A viaduct carries its slab on a pair of piers set just
 * inboard of the fascia, NOT one down the middle — and a centreline pier (now
 * that piers are solid, v0.117.1) lands in the carriageway of any road that runs
 * UNDERNEATH the bridge and walls it off. Standing the pair off toward the edges
 * leaves the centre bay clear for that lower road to pass through. At 0.6 the
 * pier centre sits well inside the deck edge, so the whole column stays under the
 * slab it holds up rather than floating off its side.
 */
const PIER_EDGE_FRAC = 0.6

/** The structural depth of a deck slab spanning `span` metres end to end. */
export function deckDepth(span: number): number {
  const extra = Math.max(0, span - DECK_SHALLOW_SPAN) * DECK_DEEPEN_PER_M
  return Math.min(DECK_DEPTH_MAX, DECK_THICKNESS + extra)
}

/**
 * A vertical quad strip standing on a polyline: a wall from `yBot(i)` up to
 * `yTop(i)` at each point. The ribbon helper only lays surfaces flat; a fascia
 * down the deck's side and a railing standing on its edge both need a wall, and
 * a railing drawn as a flat ribbon 1m up simply hung there in mid-air.
 */
function emitWall(
  out: number[],
  line: Vec2[],
  yBot: (i: number) => number,
  yTop: (i: number) => number,
): void {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const ab = yBot(i)
    const at = yTop(i)
    const bb = yBot(i + 1)
    const bt = yTop(i + 1)
    out.push(a.x, ab, a.z, a.x, at, a.z, b.x, bt, b.z)
    out.push(a.x, ab, a.z, b.x, bt, b.z, b.x, bb, b.z)
  }
}

/**
 * One thin box — a bar — written straight into a triangle soup: a rectangular
 * section `2*half` wide, running in plan from `a` to `b`, its bottom rising
 * `ab`→`bb` and its top `at`→`bt`. Heights are given per end so a rail can lean
 * along with the deck's arch while a post stands plumb. The balustrade's posts
 * and rails are all just bars, so they share this one primitive and land in the
 * same buffer. Wound either way — the rail mesh is drawn double-sided — so we
 * skip the winding bookkeeping and let flat shading light whichever face turns
 * to the sun.
 */
function emitBar(
  out: number[],
  a: Vec2,
  b: Vec2,
  half: number,
  ab: number,
  at: number,
  bb: number,
  bt: number,
): void {
  // Unit perpendicular to the bar in plan, scaled to the half-thickness: the two
  // long faces sit this far to either side of the a→b centre line.
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const nx = (-dz / len) * half
  const nz = (dx / len) * half
  // The four plan corners: each end, offset to the minus and plus side.
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
  quad(am, ab, ap, ab, ap, at, am, at) // end cap at a
  quad(bm, bb, bp, bb, bp, bt, bm, bt) // end cap at b
  quad(am, ab, am, at, bm, bt, bm, bb) // minus-side face
  quad(ap, ab, ap, at, bp, bt, bp, bb) // plus-side face
  quad(am, at, ap, at, bp, bt, bm, bt) // top face
  quad(am, ab, ap, ab, bp, bb, bm, bb) // bottom face
}

/**
 * A see-through balustrade standing on one deck edge, in place of the old filled
 * parapet that read as a solid wall of colour: plumb posts a stride apart, tied
 * by a top rail and a mid rail that lean along with the arch.
 *
 * The posts are walked out by DISTANCE, not one per deck point — the deck is
 * densified to a point every few metres, so posts-per-point would thin out or
 * bunch up with the mesh instead of the eye, and a fixed spacing keeps them even
 * over the whole span. Everything is a thin bar pushed into `out`, so the whole
 * railing merges into a single mesh and a single draw.
 */
function emitBalustrade(out: number[], line: Vec2[], dy: number[]): void {
  // Rails: one bar per deck segment, so they follow every kink of the arch. The
  // top rail hangs just under the post tops (capping them flush); the mid rail
  // is centred at MID_FRAC of the height with open air on both sides.
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const ta = dy[i] + RAIL_H
    const tb = dy[i + 1] + RAIL_H
    emitBar(out, a, b, RAIL_T / 2, ta - RAIL_T, ta, tb - RAIL_T, tb)
    const ma = dy[i] + RAIL_H * MID_FRAC
    const mb = dy[i + 1] + RAIL_H * MID_FRAC
    emitBar(out, a, b, RAIL_T / 2, ma - RAIL_T / 2, ma + RAIL_T / 2, mb - RAIL_T / 2, mb + RAIL_T / 2)
  }

  // Posts: step along the edge at a fixed spacing, standing a plumb bar wherever
  // we land. `next` carries across segment boundaries so the rhythm is even over
  // the whole span rather than restarting at every deck point.
  let dist = 0
  let next = 0
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1
    while (next <= dist + segLen) {
      const f = (next - dist) / segLen
      const cx = a.x + (b.x - a.x) * f
      const cz = a.z + (b.z - a.z) * f
      const cy = dy[i] + (dy[i + 1] - dy[i]) * f // deck height under this post
      const hx = ((b.x - a.x) / segLen) * (RAIL_T / 2) // half a post, along the edge
      const hz = ((b.z - a.z) / segLen) * (RAIL_T / 2)
      emitBar(
        out,
        { x: cx - hx, z: cz - hz },
        { x: cx + hx, z: cz + hz },
        RAIL_T / 2,
        cy, cy + RAIL_H,
        cy, cy + RAIL_H,
      )
      next += POST_SPACING
    }
    dist += segLen
  }
}

/** Total length of a polyline in metres. */
function polylineLength(pts: Vec2[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
  return s
}

/**
 * Pier bents spaced evenly along a deck, in place of one under every densified
 * point.
 *
 * We walk the centreline by DISTANCE and drop a bent every `spacing` metres,
 * interpolating the deck underside (`under`) and the ground between points, so a
 * wide span stands on a handful of bents like a real viaduct rather than a comb
 * of stilts. `next` carries across segment boundaries, keeping the rhythm even
 * over the whole span rather than restarting at each point. A bent is raised only
 * where the deck stands clear of the ground by more than PIER_MIN — the
 * abutments, where the deck has already settled onto the bank (there `under`
 * equals the ground), need none.
 *
 * Each bent is a PAIR of piers stood off to either side of the centreline by
 * PIER_EDGE_FRAC of the deck half-width (`half`), perpendicular to the span — so
 * the centre bay is left clear for a road passing beneath the bridge, rather than
 * a single pier planted in the middle of it. Both piers of a bent share the same
 * underside and ground, since the deck is flat across its width.
 */
function emitPiers(
  out: { x: number; z: number; top: number; ground: number }[],
  pts: Vec2[],
  under: number[],
  ground: number[],
  spacing: number,
  half: number,
): void {
  const off = half * PIER_EDGE_FRAC
  let dist = 0
  let next = spacing / 2 // start half a bay in, so bents sit between the ends
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const segLen = Math.hypot(dx, dz) || 1
    // Unit perpendicular to the span here (left of travel), toward the deck edge.
    const nx = -dz / segLen
    const nz = dx / segLen
    while (next <= dist + segLen) {
      const f = (next - dist) / segLen
      const top = under[i] + (under[i + 1] - under[i]) * f
      const g = ground[i] + (ground[i + 1] - ground[i]) * f
      if (top - g > PIER_MIN) {
        const cx = a.x + dx * f
        const cz = a.z + dz * f
        out.push({ x: cx + nx * off, z: cz + nz * off, top, ground: g })
        out.push({ x: cx - nx * off, z: cz - nz * off, top, ground: g })
      }
      next += spacing
    }
    dist += segLen
  }
}

/** A pier's collidable stump: its centre, the deck underside it rises to, and the ground it stands on. */
export interface PierCollider {
  x: number
  z: number
  top: number
  ground: number
}

/** Square collision-footprint half-width for a pier — its base radius (~0.7m) plus a little slack. */
export const PIER_COLLIDER_R = 0.8

/**
 * Collision footprints for a set of piers, each capped at its deck underside.
 *
 * A pier is solid to a car on the road BELOW the bridge but not to one ON the deck:
 * the footprint's `top` is the deck underside, and `resolveCircle` skips any footprint
 * the car is at or above (`y >= topOf`). So the deck stays drivable while the pillars
 * beneath it stop you driving through them.
 */
export function pierFootprints(piers: PierCollider[]): { footprints: Vec2[][]; tops: number[] } {
  const footprints: Vec2[][] = []
  const tops: number[] = []
  const r = PIER_COLLIDER_R
  for (const p of piers) {
    footprints.push([
      { x: p.x - r, z: p.z - r },
      { x: p.x + r, z: p.z - r },
      { x: p.x + r, z: p.z + r },
      { x: p.x - r, z: p.z + r },
    ])
    tops.push(p.top)
  }
  return { footprints, tops }
}

/**
 * A bridge: its deck at the profiled height, a railing down each side, and piers
 * where it stands clear of the ground.
 *
 * The deck's height comes from the profile rather than a fixed lift, so it meets
 * the approach roads at both ends and can actually be driven onto. The piers it
 * raises are stashed on `group.userData.piers` ({@link PierCollider}[]) so the
 * caller can make them solid via {@link pierFootprints}.
 */
export function buildBridges(decks: Deck[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!decks.length) return group

  const deckPos: number[] = []
  const railPos: number[] = []
  const piers: { x: number; z: number; top: number; ground: number }[] = []

  for (const d of decks) {
    const pts = d.road.points
    const half = roadWidth(d.road.kind) / 2
    // By index, not by coordinate: the ribbon's vertices are offset out to the
    // road's edges, so looking the height up by position never matches and the
    // whole deck comes out flat at its first point.
    const sides = offsetsForPolyline(pts, half)

    // How deep the girder is, from the span it carries: a short overpass keeps
    // the base slab, a long river crossing gets a deeper beam so it does not read
    // as a thin sheet afloat over the water.
    const depth = deckDepth(polylineLength(pts))

    // The slab's underside sits `depth` below the drivable top, but never below
    // the ground it spans: at the abutments the deck settles onto the embankment,
    // so we clamp there and the slab tapers to nothing rather than burying its
    // underside in the hillside. Sampled once and reused for the fascia and the
    // piers.
    const ground = pts.map((p) => provider.heightAt(p.x, p.z))
    const under = d.y.map((y, i) => Math.max(y - depth, ground[i]))

    // A solid slab: drivable top, underside, and a fascia down each edge — so the
    // deck reads as real depth instead of a plane a couple of pixels thick.
    emitRibbon(deckPos, sides, (_v, i) => d.y[i])
    emitRibbon(deckPos, sides, (_v, i) => under[i])
    emitWall(deckPos, sides.map((s) => s.left), (i) => under[i], (i) => d.y[i])
    emitWall(deckPos, sides.map((s) => s.right), (i) => under[i], (i) => d.y[i])

    // A see-through balustrade on each deck edge, in place of the old filled
    // parapet: posts a couple of metres apart tied by a top and a mid rail. Both
    // edges feed the one railPos buffer, so it all stays a single merged mesh.
    for (const edge of ['left', 'right'] as const) {
      emitBalustrade(railPos, sides.map((s) => s[edge]), d.y)
    }

    // Pier bents spaced along the span, their tops at the deck's underside (not
    // its surface — a pier reaching the profiled height poked up through the
    // deck). Each bent is a pair stood off toward the deck edges (so a road below
    // runs through the clear centre), stopping beneath the slab and carrying it
    // from below, only where it stands clear of the ground.
    emitPiers(piers, pts, under, ground, PIER_SPACING, half)
  }

  group.add(ribbonMesh(deckPos, DECK_COLOR))
  group.add(ribbonMesh(railPos, RAIL_COLOR))

  if (piers.length) {
    // One instanced draw for every pier in the city.
    const geo = new THREE.CylinderGeometry(0.55, 0.7, 1, 6)
    geo.translate(0, 0.5, 0) // stand on its base, so scaling y sets the height
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: PIER_COLOR, flatShading: true }),
      piers.length,
    )
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    piers.forEach((pier, i) => {
      p.set(pier.x, pier.ground, pier.z)
      s.set(1, pier.top - pier.ground, 1)
      mesh.setMatrixAt(i, m.compose(p, q, s))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  group.userData.piers = piers // so the caller can add solid footprints (pierFootprints)
  return group
}
