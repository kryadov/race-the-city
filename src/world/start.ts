import type { Road, Vec2 } from '../geo/types'

/** Where a drive begins, and which way it is pointing. */
export interface StartPose {
  x: number
  z: number
  /** Radians; 0 faces +x, and +heading turns toward +z. */
  heading: number
}

/** Roads that are no place to be dropped on. */
const UNDRIVABLE = new Set(['path'])

/**
 * Where to put the car when a city loads: the nearest road to the middle,
 * facing along it.
 *
 * The middle is where the geocoder pointed, and a geocoder points at a place,
 * not at a road — Tokyo's is a building, and you started inside it, wedged
 * against a wall with the camera in the masonry. A city's centre is only ever
 * approximately a street.
 *
 * Returns null when there is nothing to start on; the caller keeps the origin,
 * which is no worse than it was.
 */
export function startPose(roads: Road[]): StartPose | null {
  let best: StartPose | null = null
  let bestD = Infinity

  for (const road of roads) {
    if (UNDRIVABLE.has(road.kind)) continue
    // Tunnels are not modelled — the road is inside whatever stands above it,
    // which is the very thing this exists to avoid.
    if (road.tunnel) continue
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i]
      const d = p.x * p.x + p.z * p.z
      if (d >= bestD) continue
      bestD = d
      // Along the road, in whichever direction it has one: the next vertex for
      // any point but the last, the previous one for the last.
      const next = road.points[i + 1] ?? p
      const prev = road.points[i - 1] ?? p
      const [a, b]: [Vec2, Vec2] = next === p ? [prev, p] : [p, next]
      best = { x: p.x, z: p.z, heading: Math.atan2(b.z - a.z, b.x - a.x) }
    }
  }
  return best
}
