import type { Vec2 } from '../geo/types'

/**
 * Split a polyline so no segment is longer than `step`.
 *
 * OSM maps a straight road with as few vertices as it can get away with: in
 * Monaco the median gap is 6.7m but the longest is 160m, and 28% of segments are
 * longer than the terrain grid's 12.5m cell. A ribbon drawn straight between two
 * such vertices is a chord over rolling ground — it floats over the dips and
 * sinks under the crests, and the car, which follows the ground, disappears
 * under its own road.
 */
export function densify(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points.slice()
  const out: Vec2[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
    }
  }
  return out
}
