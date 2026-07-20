import type { Vec2 } from '../geo/types'
import type { SpatialGrid } from './grid'

export function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z
    const xj = poly[j].x, zj = poly[j].z
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Nearest point on segment ab to p, plus the squared distance to it. */
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist2: number } {
  const abx = b.x - a.x, abz = b.z - a.z
  const apx = p.x - a.x, apz = p.z - a.z
  const len2 = abx * abx + abz * abz || 1
  let t = (apx * abx + apz * abz) / len2
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + abx * t, z: a.z + abz * t }
  const dx = p.x - point.x, dz = p.z - point.z
  return { point, dist2: dx * dx + dz * dz }
}

/**
 * How much higher than the car a surface may be and still be driven UP onto,
 * rather than hit as a wall — a wheel-radius. Lets you mount a kerb, a low ledge,
 * or the next step of a terraced roof instead of being stopped dead against ground
 * only a few centimetres above your own.
 */
export const STEP_UP = 0.35

/**
 * If (x,z) with the given radius overlaps a nearby footprint, push it out to
 * the closest polygon edge plus the radius. Sliding falls out naturally: only
 * the penetration component is removed, tangential motion is preserved.
 */
export function resolveCircle(
  x: number,
  z: number,
  radius: number,
  grid: SpatialGrid,
  y = -Infinity,
): Vec2 {
  let pos: Vec2 = { x, z }
  for (const poly of grid.near(x, z)) {
    // Over the top of it — or within a step of the top — is not a wall: a car high
    // enough clears a roof, and one only a wheel-radius below a ledge climbs onto it
    // rather than being stopped in mid-air by ground it is nearly level with.
    if (y >= grid.topOf(poly) - STEP_UP) continue
    const inside = pointInPolygon(pos.x, pos.z, poly)
    let best: { point: Vec2; dist2: number } | null = null
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSegment(pos, poly[j], poly[i])
      if (!best || c.dist2 < best.dist2) best = c
    }
    if (!best) continue
    const dist = Math.sqrt(best.dist2)
    if (inside) {
      // shove outward along edge normal (edge -> pos direction), out past the wall
      const nx = (best.point.x - pos.x) / (dist || 1)
      const nz = (best.point.z - pos.z) / (dist || 1)
      pos = { x: best.point.x + nx * radius, z: best.point.z + nz * radius }
    } else if (dist < radius) {
      const nx = (pos.x - best.point.x) / (dist || 1)
      const nz = (pos.z - best.point.z) / (dist || 1)
      pos = { x: best.point.x + nx * radius, z: best.point.z + nz * radius }
    }
  }
  return pos
}

/** A moving thing the car can hit: a traffic car, a person. */
export interface Circle {
  x: number
  z: number
  r: number
}

/**
 * Push a circle out of any circles it overlaps, and report the way out.
 *
 * Used for the things that move — traffic and pedestrians — which can't live in
 * the static grid. It resolves against each in turn rather than solving them
 * together: with a handful of overlaps at a time the difference isn't visible,
 * and the simple version can't wedge.
 *
 * @returns the freed position, whether anything was hit, and the unit normal
 *   pointing away from the last thing hit — which is what a bounce needs
 */
export function resolveAgainstCircles(
  x: number,
  z: number,
  r: number,
  circles: Circle[],
): { x: number; z: number; hit: boolean; nx: number; nz: number } {
  let px = x
  let pz = z
  let hit = false
  let nx = 0
  let nz = 0
  for (const c of circles) {
    const dx = px - c.x
    const dz = pz - c.z
    const min = r + c.r
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min) continue
    const d = Math.sqrt(d2)
    hit = true
    if (d < 1e-6) {
      // Dead centre: no direction to push, so pick one rather than divide by zero.
      px = c.x + min
      pz = c.z
      nx = 1
      nz = 0
      continue
    }
    nx = dx / d
    nz = dz / d
    px = c.x + nx * min
    pz = c.z + nz * min
  }
  return { x: px, z: pz, hit, nx, nz }
}

/**
 * Bounce a velocity off a surface with the given outward normal.
 *
 * Only the part heading into the surface is reversed; the part sliding along it
 * is kept, so a glancing blow slides rather than stopping dead.
 *
 * @param restitution 0 = no bounce, 1 = a perfect one
 */
export function bounce(
  vx: number,
  vz: number,
  nx: number,
  nz: number,
  restitution: number,
): { vx: number; vz: number } {
  const into = vx * nx + vz * nz
  if (into >= 0) return { vx, vz } // already heading away; don't fling it back in
  const k = (1 + restitution) * into
  return { vx: vx - k * nx, vz: vz - k * nz }
}

/**
 * The height of the highest roof directly under (x, z), or null over open ground.
 *
 * The grid already knows where every building stands and how tall it is; this
 * asks the other question about it — not "may I be here", but "what is beneath
 * me". A car that clears a roof and lands on it needs the roof to be ground,
 * exactly as a bridge deck is.
 */
export function roofUnder(x: number, z: number, grid: SpatialGrid): number | null {
  let best: number | null = null
  for (const poly of grid.near(x, z)) {
    const top = grid.topOf(poly)
    if (!Number.isFinite(top)) continue // height unknown: not something to land on
    if (best !== null && top <= best) continue
    if (pointInPolygon(x, z, poly)) best = top
  }
  return best
}
