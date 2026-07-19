import type { Road, Vec2 } from '../geo/types'
import { pointInPolygon } from '../physics/collide'

/** Where a drive begins, and which way it is pointing. */
export interface StartPose {
  x: number
  z: number
  /** Radians; 0 faces +x, and +heading turns toward +z. */
  heading: number
}

/** Roads that are no place to be dropped on. */
const UNDRIVABLE = new Set(['path'])

// Where a wall would be in your face. Probes marched out AHEAD along the heading;
// a building footprint under one counts against that facing, and a nearer probe
// weighs more — a wall at the bumper is worse than one down the block.
const AHEAD: ReadonlyArray<{ d: number; w: number }> = [
  { d: 3, w: 1.2 },
  { d: 6, w: 1.0 },
  { d: 10, w: 0.6 },
]
// The chase camera sits ~14 m BEHIND and ~7 m above the car, looking back at it
// (scene.ts: back = 14, up = 7 at the default zoom). A building on the ground in
// that band stands in the shot. We have only footprints here, not heights, so any
// footprint under the back-track is treated as a blocker: the common case is a
// house right at the rear bumper, and the cure is only ever to nudge the spawn.
// A blocked view counts for less than a wall you're staring straight into.
const BEHIND: ReadonlyArray<{ d: number; w: number }> = [
  { d: 6, w: 0.7 },
  { d: 10, w: 0.5 },
  { d: 14, w: 0.3 },
]
// What a blocked facing is worth in metres of walking to a clearer spot: enough
// to turn the car around, or roll a short way off a walled-in vertex, but small
// enough that we never wander far from the centre the geocoder actually named.
const DETOUR_PER_PENALTY = 25
// Vertices past this much farther than the nearest aren't worth scoring: a clear
// spot out there is too far from the centre to be worth the walk to reach it.
const SEARCH_BAND = 120

/** Reflect a heading 180°, kept in (-π, π]. */
const opposite = (h: number): number => (h > 0 ? h - Math.PI : h + Math.PI)

/**
 * Where to put the car when a city loads: a road near the middle, facing an
 * OPEN direction — not into a wall, and not with a house sat behind blocking the
 * chase camera.
 *
 * The middle is where the geocoder pointed, and a geocoder points at a place,
 * not at a road — Tokyo's is a building, and you started inside it, wedged
 * against a wall with the camera in the masonry. So we don't just take the
 * nearest vertex: among the vertices near the centre we score each by what
 * stands around it, try BOTH directions along its road, and keep the clearest.
 * With no buildings to avoid this reduces exactly to the old nearest-vertex,
 * face-along-the-road pick.
 *
 * `buildings` are footprint rings (the caller passes each building's footprint).
 * Returns null when there is nothing to start on; the caller keeps the origin,
 * which is no worse than it was.
 */
export function startPose(roads: Road[], buildings: Vec2[][] = []): StartPose | null {
  // Every drivable, above-ground road vertex, with the way's own direction there
  // — the same set the old nearest-vertex pick drew from.
  type Cand = { x: number; z: number; heading: number; dist: number }
  const cands: Cand[] = []
  let nearest = Infinity
  for (const road of roads) {
    if (UNDRIVABLE.has(road.kind)) continue
    // Tunnels are not modelled — the road is inside whatever stands above it,
    // which is the very thing this exists to avoid.
    if (road.tunnel) continue
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i]
      // Along the road, in whichever direction it has one: the next vertex for
      // any point but the last, the previous one for the last.
      const next = road.points[i + 1] ?? p
      const prev = road.points[i - 1] ?? p
      const [a, b]: [Vec2, Vec2] = next === p ? [prev, p] : [p, next]
      const heading = Math.atan2(b.z - a.z, b.x - a.x)
      const dist = Math.hypot(p.x, p.z)
      cands.push({ x: p.x, z: p.z, heading, dist })
      if (dist < nearest) nearest = dist
    }
  }
  if (cands.length === 0) return null

  // Building bounding boxes, computed once, so most footprints are ruled out of a
  // probe with four comparisons instead of a full point-in-polygon walk.
  const boxes = buildings.map((ring) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const v of ring) {
      if (v.x < minX) minX = v.x
      if (v.x > maxX) maxX = v.x
      if (v.z < minZ) minZ = v.z
      if (v.z > maxZ) maxZ = v.z
    }
    return { minX, maxX, minZ, maxZ, ring }
  })
  const insideAny = (x: number, z: number): boolean => {
    for (const box of boxes) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
      if (pointInPolygon(x, z, box.ring)) return true
    }
    return false
  }
  // Total weight of the probes along `heading` from (x,z) that land in a building.
  const facingPenalty = (x: number, z: number, heading: number): number => {
    const dx = Math.cos(heading), dz = Math.sin(heading)
    let pen = 0
    for (const { d, w } of AHEAD) if (insideAny(x + dx * d, z + dz * d)) pen += w
    for (const { d, w } of BEHIND) if (insideAny(x - dx * d, z - dz * d)) pen += w
    return pen
  }

  let best: StartPose | null = null
  let bestScore = Infinity
  for (const c of cands) {
    if (c.dist > nearest + SEARCH_BAND) continue // too far from the centre to bother
    // Try the way's own direction first; flip only if the reverse is strictly
    // clearer, so an open street keeps its natural heading (and an empty
    // `buildings` list reproduces the old face-along-the-road pick exactly).
    const penFwd = facingPenalty(c.x, c.z, c.heading)
    const penRev = facingPenalty(c.x, c.z, opposite(c.heading))
    const heading = penRev < penFwd ? opposite(c.heading) : c.heading
    const score = c.dist + DETOUR_PER_PENALTY * Math.min(penFwd, penRev)
    if (score < bestScore) {
      bestScore = score
      best = { x: c.x, z: c.z, heading }
    }
  }
  return best
}
