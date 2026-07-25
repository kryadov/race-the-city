import type { Vec2 } from '../geo/types'
import type { Circle } from '../physics/collide'

/**
 * One labelled batch of static colliders, as the physics grid was fed them —
 * buildings, props, piers, parked cars, quay walls. The label is the whole point:
 * the grid itself holds bare polygons, so once a wall is in there nothing can say
 * WHAT it was, and a player stuck against an invisible one has no way to tell us.
 */
export interface SolidSource {
  name: string
  polys: Vec2[][]
  /** Absolute height of each polygon's top, parallel to `polys` (may be shorter). */
  tops?: number[]
}

/** Distance from (x,z) to a polygon's outline, in metres (0 inside is not tested —
 *  an edge distance is what a stuck car cares about). */
function edgeDistance(x: number, z: number, poly: Vec2[]): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x, az = poly[j].z
    const bx = poly[i].x, bz = poly[i].z
    const dx = bx - ax, dz = bz - az
    const len2 = dx * dx + dz * dz || 1
    let t = ((x - ax) * dx + (z - az) * dz) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const cx = ax + dx * t, cz = az + dz * t
    const d = Math.hypot(x - cx, z - cz)
    if (d < best) best = d
  }
  return best
}

/**
 * What is solid around (x, z), as a line short enough for the paused HUD.
 *
 * The pause readout already gives the pose, which is what makes a bug report
 * reproducible; this answers the other half of "I'm stuck and there's nothing
 * there" — WHAT is holding the car, by name, and how far off it is. Static
 * colliders are named by source; moving ones (traffic, people, trains) are
 * counted separately, because "a wall" and "a bot you cannot see" want very
 * different fixes and a screenshot cannot tell them apart.
 *
 * Pure and allocation-light: it walks the batches given, sorts a handful of hits,
 * and returns a string. Nothing here touches the scene.
 *
 * @returns e.g. `solid: quay@1.2m top31.4 · building@6.8m | movers: 1@3.1m` — or
 *   `solid: none within 8m` when the car is stuck on nothing at all, which is
 *   itself the answer we need.
 */
export function describeSolids(
  x: number,
  z: number,
  sources: readonly SolidSource[],
  movers: readonly Circle[] = [],
  radius = 8,
  limit = 3,
): string {
  const hits: { name: string; d: number; top?: number }[] = []
  for (const src of sources) {
    for (let i = 0; i < src.polys.length; i++) {
      const poly = src.polys[i]
      if (poly.length < 2) continue
      // cheap bbox reject before the per-edge walk
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of poly) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.z < minZ) minZ = p.z
        if (p.z > maxZ) maxZ = p.z
      }
      if (x < minX - radius || x > maxX + radius || z < minZ - radius || z > maxZ + radius) continue
      const d = edgeDistance(x, z, poly)
      if (d <= radius) hits.push({ name: src.name, d, top: src.tops?.[i] })
    }
  }
  hits.sort((a, b) => a.d - b.d)
  const solid = hits.length
    ? hits
        .slice(0, limit)
        .map((h) => `${h.name}@${h.d.toFixed(1)}m${h.top !== undefined && Number.isFinite(h.top) ? ` top${h.top.toFixed(1)}` : ''}`)
        .join(' · ')
    : `none within ${radius}m`

  const close = movers
    .map((m) => ({ d: Math.hypot(m.x - x, m.z - z) - m.r, y: m.y }))
    .filter((m) => m.d <= radius)
    .sort((a, b) => a.d - b.d)
  const moving = close.length
    ? ` | movers: ${close.length}@${Math.max(0, close[0].d).toFixed(1)}m${close[0].y !== undefined ? ` y${close[0].y.toFixed(1)}` : ''}`
    : ''
  return `solid: ${solid}${moving}`
}
