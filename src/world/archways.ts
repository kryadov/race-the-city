import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'
import { ribbonMesh } from './roads'

/**
 * Where a drivable, non-tunnel road (or rail) runs straight THROUGH a building
 * footprint, the road vanishes into a wall and bots drive into the masonry. This
 * module opens a passage: it SUBTRACTS the road corridor from the building's
 * collision footprint (so the ground-level corridor is drivable while the rest of
 * the building stays solid) and stands a stone archway over it so the building
 * reads as bridged over the way rather than sliced by a bug.
 *
 * The subtraction is a pair of Sutherland–Hodgman clips against the corridor's two
 * long edges — kept as half-planes, so the corridor is an infinite band aligned
 * with the road and the passage runs all the way through the building. Clipping a
 * simple polygon (convex OR concave) against a single half-plane is exact, so the
 * essential invariant holds by construction: a point ON the corridor is removed
 * from EVERY remainder (drivable), and a point in the building OFF the corridor
 * keeps its half-plane and stays in a remainder (solid). The building's extruded
 * MESH is left untouched (no CSG); only the collision footprint is carved and a
 * decorative frame added.
 */

/** How much wider than the physical way the passage is opened, per side (metres). */
export const MARGIN = 1.0
/** At most this many buildings get a passage opened, to bound the work per city. */
export const MAX_OPENINGS = 64
/** At most this many corridors are subtracted from a single building. */
export const MAX_CORRIDORS = 6
/** Remainder pieces smaller than this (m²) are dropped as slivers. */
const MIN_PIECE_AREA = 1.0

// Arch dimensions.
const CLEAR_H = 4.5 // headroom under the lintel on a normal building
const MIN_CLEAR = 2.6 // a car still fits under a very low building's frame
const BEAM_H = 0.7 // lintel/beam vertical thickness
const BEAM_HW = 0.35 // half-thickness of a beam across its run
const PILLAR_HW = 0.4 // half-width of a square pillar
const PROUD = 0.4 // how far the frame stands out beyond the wall face
const MIN_SPAN = 0.5 // shorter passages get no visual frame (still carved)
const ARCH_COLOR = 0x8f8578 // weathered stone, a touch darker than the facades

/** A road/rail centreline widened into a collidable band, aligned with the way. */
export interface Corridor {
  /** A point on the centreline. */
  cx: number
  cz: number
  /** Unit direction along the way. */
  dx: number
  dz: number
  /** Band half-width: the physical half-width plus {@link MARGIN}. */
  half: number
}

/** A drivable centreline handed in for crossing detection. */
export interface DrivableWay {
  points: Vec2[]
  /** The physical half-width of the way (road/2, or a rail's half-gauge+ballast). */
  half: number
}

export interface Archways {
  /** The stone frames, one merged mesh (or an empty group). Neon-flipped as `archways`. */
  object: THREE.Object3D
  /** Building collision footprints, crossed buildings replaced by their remainders. */
  footprints: Vec2[][]
  /** Roof heights parallel to {@link footprints}. */
  tops: number[]
  /** How many buildings had a passage opened. */
  openedCount: number
  /** Buildings that a way crossed but whose whole footprint fell inside the band —
   *  kept SOLID rather than risk a full hole; the road stays blocked there. */
  unhandledCount: number
}

/** Absolute area of a simple polygon (shoelace). */
export function polygonArea(poly: Vec2[]): number {
  if (poly.length < 3) return 0
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].z - poly[i].z)
  }
  return Math.abs(a) / 2
}

/** Parameter t on segment a→b where it properly crosses segment c→d, else null. */
function segCrossT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b.x - a.x, rz = b.z - a.z
  const sx = d.x - c.x, sz = d.z - c.z
  const denom = rx * sz - rz * sx
  if (Math.abs(denom) < 1e-9) return null // parallel or collinear: an edge-touch, not a crossing
  const qx = c.x - a.x, qz = c.z - a.z
  const t = (qx * sz - qz * sx) / denom
  const u = (qx * rz - qz * rx) / denom
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t
  return null
}

/**
 * Does segment a→b pass through the polygon's INTERIOR (a real crossing), rather
 * than merely touch an edge or miss it? An endpoint inside is a crossing; else we
 * split the segment at every edge intersection and ask whether the midpoint of any
 * sub-span lies inside — so a tangential touch at a vertex or a run along an edge,
 * which never puts a sub-span's midpoint inside, is correctly ignored.
 */
export function segmentThroughPolygon(a: Vec2, b: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false
  if (pointInPolygon(a.x, a.z, poly) || pointInPolygon(b.x, b.z, poly)) return true
  const ts: number[] = [0, 1]
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const t = segCrossT(a, b, poly[j], poly[i])
    if (t !== null) ts.push(t)
  }
  ts.sort((p, q) => p - q)
  for (let i = 0; i + 1 < ts.length; i++) {
    const tm = (ts[i] + ts[i + 1]) / 2
    const mx = a.x + (b.x - a.x) * tm
    const mz = a.z + (b.z - a.z) * tm
    if (pointInPolygon(mx, mz, poly)) return true
  }
  return false
}

/** The band a way segment a→b sweeps, widened by {@link MARGIN} past `physicalHalf`. */
export function corridorFor(a: Vec2, b: Vec2, physicalHalf: number): Corridor {
  const dx = b.x - a.x, dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  return {
    cx: (a.x + b.x) / 2,
    cz: (a.z + b.z) / 2,
    dx: dx / len,
    dz: dz / len,
    half: physicalHalf + MARGIN,
  }
}

/** Signed perpendicular distance of p from the corridor's centreline. */
export function perpDistance(cor: Corridor, p: Vec2): number {
  const nx = -cor.dz, nz = cor.dx
  return (p.x - cor.cx) * nx + (p.z - cor.cz) * nz
}

/**
 * Sutherland–Hodgman clip of `poly` against one of the corridor's long edges,
 * keeping the side AWAY from the centreline: `side = +1` keeps the band's left
 * half-plane (perp ≥ half), `side = -1` the right (perp ≤ −half). The band itself
 * is never kept, so the two clips are the passage's left and right remainders.
 */
export function clipToHalfPlane(poly: Vec2[], cor: Corridor, side: 1 | -1): Vec2[] {
  const nx = -cor.dz, nz = cor.dx
  const value = (p: Vec2): number => side * ((p.x - cor.cx) * nx + (p.z - cor.cz) * nz) - cor.half
  const out: Vec2[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const cur = poly[i]
    const prev = poly[(i - 1 + n) % n]
    const dc = value(cur)
    const dp = value(prev)
    if (dc >= 0) {
      if (dp < 0) out.push(crossPoint(prev, cur, dp, dc))
      out.push(cur)
    } else if (dp >= 0) {
      out.push(crossPoint(prev, cur, dp, dc))
    }
  }
  return out
}

/** Where the edge a→b crosses value=0, given the endpoints' signed values. */
function crossPoint(a: Vec2, b: Vec2, da: number, db: number): Vec2 {
  const t = da / (da - db)
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}

/**
 * Footprint minus every corridor, as a list of solid remainder pieces. Each
 * corridor removes its band from all current pieces (left + right half-plane
 * clips), so multiple ways crossing one building all open. Returns `[]` only if
 * the band(s) swallowed the whole footprint — the caller then keeps it solid.
 */
export function subtractCorridors(footprint: Vec2[], corridors: Corridor[]): Vec2[][] {
  let pieces: Vec2[][] = [footprint]
  for (const cor of corridors) {
    const next: Vec2[][] = []
    for (const piece of pieces) {
      const left = clipToHalfPlane(piece, cor, 1)
      const right = clipToHalfPlane(piece, cor, -1)
      if (polygonArea(left) >= MIN_PIECE_AREA) next.push(left)
      if (polygonArea(right) >= MIN_PIECE_AREA) next.push(right)
    }
    pieces = next
    if (!pieces.length) break
  }
  return pieces
}

interface Bbox {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

function bboxOf(poly: Vec2[]): Bbox {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, minZ, maxX, maxZ }
}

function segBbox(a: Vec2, b: Vec2): Bbox {
  return {
    minX: Math.min(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxX: Math.max(a.x, b.x),
    maxZ: Math.max(a.z, b.z),
  }
}

function bboxOverlap(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ
}

/** The centreline span of `cor` across `poly`, as the low/high projection of the
 *  footprint's vertices onto the direction — the building's extent along the way. */
function projectExtent(cor: Corridor, poly: Vec2[]): { lo: number; hi: number } {
  let lo = Infinity, hi = -Infinity
  for (const p of poly) {
    const t = (p.x - cor.cx) * cor.dx + (p.z - cor.cz) * cor.dz
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  return { lo, hi }
}

/** An axis-oriented box (length along (ux,uz), width across it) as a triangle soup. */
function emitBox(
  out: number[],
  cx: number,
  cz: number,
  ux: number,
  uz: number,
  hl: number,
  hw: number,
  yBot: number,
  yTop: number,
): void {
  const ax = ux * hl, az = uz * hl
  const bx = -uz * hw, bz = ux * hw
  const c: Vec2[] = [
    { x: cx - ax - bx, z: cz - az - bz },
    { x: cx + ax - bx, z: cz + az - bz },
    { x: cx + ax + bx, z: cz + az + bz },
    { x: cx - ax + bx, z: cz - az + bz },
  ]
  const tri = (
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
  ): void => {
    out.push(x1, y1, z1, x2, y2, z2, x3, y3, z3)
  }
  // top and bottom caps (the mesh is drawn double-sided, so winding is free)
  tri(c[0].x, yTop, c[0].z, c[1].x, yTop, c[1].z, c[2].x, yTop, c[2].z)
  tri(c[0].x, yTop, c[0].z, c[2].x, yTop, c[2].z, c[3].x, yTop, c[3].z)
  tri(c[0].x, yBot, c[0].z, c[1].x, yBot, c[1].z, c[2].x, yBot, c[2].z)
  tri(c[0].x, yBot, c[0].z, c[2].x, yBot, c[2].z, c[3].x, yBot, c[3].z)
  for (let k = 0; k < 4; k++) {
    const A = c[k], B = c[(k + 1) % 4]
    tri(A.x, yBot, A.z, B.x, yBot, B.z, B.x, yTop, B.z)
    tri(A.x, yBot, A.z, B.x, yTop, B.z, A.x, yTop, A.z)
  }
}

/**
 * A gate frame over one corridor: four pillars at the passage's corners and a
 * rectangle of beams capping them, at ~{@link CLEAR_H} headroom (capped under the
 * roof). The building mass reads above the lintel because its extruded mesh is
 * left whole; the frame just says the opening is intentional.
 */
function emitArch(
  out: number[],
  cor: Corridor,
  poly: Vec2[],
  roofTop: number,
  provider: ElevationProvider,
): void {
  const { lo, hi } = projectExtent(cor, poly)
  if (hi - lo < MIN_SPAN) return
  const nx = -cor.dz, nz = cor.dx
  const half = cor.half
  // Passage faces, stood a little proud of the wall on each side.
  const entry: Vec2 = { x: cor.cx + cor.dx * (lo - PROUD), z: cor.cz + cor.dz * (lo - PROUD) }
  const exit: Vec2 = { x: cor.cx + cor.dx * (hi + PROUD), z: cor.cz + cor.dz * (hi + PROUD) }
  const eL: Vec2 = { x: entry.x + nx * half, z: entry.z + nz * half }
  const eR: Vec2 = { x: entry.x - nx * half, z: entry.z - nz * half }
  const xL: Vec2 = { x: exit.x + nx * half, z: exit.z + nz * half }
  const xR: Vec2 = { x: exit.x - nx * half, z: exit.z - nz * half }
  const gE = provider.heightAt(entry.x, entry.z)
  const gX = provider.heightAt(exit.x, exit.z)
  // Lintel just below the roof, but at least a car's height off the ground.
  const cap = (g: number): number => Math.max(g + MIN_CLEAR, Math.min(g + CLEAR_H, roofTop - BEAM_H))
  const top = Math.min(cap(gE), cap(gX))
  // Four pillars.
  emitBox(out, eL.x, eL.z, cor.dx, cor.dz, PILLAR_HW, PILLAR_HW, gE, top)
  emitBox(out, eR.x, eR.z, cor.dx, cor.dz, PILLAR_HW, PILLAR_HW, gE, top)
  emitBox(out, xL.x, xL.z, cor.dx, cor.dz, PILLAR_HW, PILLAR_HW, gX, top)
  emitBox(out, xR.x, xR.z, cor.dx, cor.dz, PILLAR_HW, PILLAR_HW, gX, top)
  // Lintels across each face + side beams along each edge: a rectangle on top.
  emitBox(out, entry.x, entry.z, nx, nz, half, BEAM_HW, top, top + BEAM_H)
  emitBox(out, exit.x, exit.z, nx, nz, half, BEAM_HW, top, top + BEAM_H)
  const sideHl = (hi - lo) / 2 + PROUD
  const midL: Vec2 = { x: (eL.x + xL.x) / 2, z: (eL.z + xL.z) / 2 }
  const midR: Vec2 = { x: (eR.x + xR.x) / 2, z: (eR.z + xR.z) / 2 }
  emitBox(out, midL.x, midL.z, cor.dx, cor.dz, sideHl, BEAM_HW, top, top + BEAM_H)
  emitBox(out, midR.x, midR.z, cor.dx, cor.dz, sideHl, BEAM_HW, top, top + BEAM_H)
}

/**
 * Open a passage through every building a drivable way runs through: carve the
 * corridor out of the collision footprint (keeping the remainders solid) and
 * stand an archway over it.
 *
 * @param footprints building footprints (as {@link buildBuildings} returns them)
 * @param tops       roof heights parallel to `footprints`
 * @param ways       drivable, non-tunnel centrelines with their physical half-widths
 */
export function buildArchways(
  footprints: Vec2[][],
  tops: number[],
  ways: DrivableWay[],
  provider: ElevationProvider,
): Archways {
  const bboxes = footprints.map(bboxOf)
  // Gather the corridors crossing each building (capped, in building-index order).
  const perBuilding = new Map<number, Corridor[]>()
  for (const way of ways) {
    const pts = way.points
    for (let s = 0; s + 1 < pts.length; s++) {
      const a = pts[s], b = pts[s + 1]
      const sb = segBbox(a, b)
      for (let i = 0; i < footprints.length; i++) {
        if (footprints[i].length < 3) continue
        if (!bboxOverlap(sb, bboxes[i])) continue
        const list = perBuilding.get(i)
        if (list && list.length >= MAX_CORRIDORS) continue
        if (!list && perBuilding.size >= MAX_OPENINGS) continue
        if (!segmentThroughPolygon(a, b, footprints[i])) continue
        const cor = corridorFor(a, b, way.half)
        if (list) list.push(cor)
        else perBuilding.set(i, [cor])
      }
    }
  }

  const gridFootprints: Vec2[][] = []
  const gridTops: number[] = []
  const soup: number[] = []
  let openedCount = 0
  let unhandledCount = 0

  for (let i = 0; i < footprints.length; i++) {
    const corridors = perBuilding.get(i)
    if (!corridors || !corridors.length) {
      gridFootprints.push(footprints[i])
      gridTops.push(tops[i])
      continue
    }
    const remainders = subtractCorridors(footprints[i], corridors)
    if (!remainders.length) {
      // The band swallowed the whole footprint. Keep it SOLID rather than open a
      // hole through the entire building; the road stays blocked here (reported).
      gridFootprints.push(footprints[i])
      gridTops.push(tops[i])
      unhandledCount++
      continue
    }
    for (const r of remainders) {
      gridFootprints.push(r)
      gridTops.push(tops[i])
    }
    openedCount++
    for (const cor of corridors) emitArch(soup, cor, footprints[i], tops[i], provider)
  }

  const object: THREE.Object3D = soup.length ? ribbonMesh(soup, ARCH_COLOR) : new THREE.Group()
  object.name = 'archways'
  return { object, footprints: gridFootprints, tops: gridTops, openedCount, unhandledCount }
}
