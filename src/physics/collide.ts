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
 * If (x,z) with the given radius overlaps a nearby footprint, push it out to
 * the closest polygon edge plus the radius. Sliding falls out naturally: only
 * the penetration component is removed, tangential motion is preserved.
 */
export function resolveCircle(x: number, z: number, radius: number, grid: SpatialGrid): Vec2 {
  let pos: Vec2 = { x, z }
  for (const poly of grid.near(x, z)) {
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
