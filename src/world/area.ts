import type { Vec2 } from '../geo/types'

/**
 * Signed area of a ring, in m². Positive or negative depending on winding, so
 * callers almost always want the absolute value.
 */
export function ringArea(ring: Vec2[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].z - ring[i].x * ring[j].z
  }
  return a / 2
}

/**
 * The largest circle that fits inside a ring, roughly — found by sampling its
 * bounding box on a grid and keeping the point furthest from any edge.
 *
 * The area alone is not enough to say whether a ship fits: a river can be a
 * square kilometre and forty metres wide, and a canal is long, not big. This
 * asks how much room there actually is at the widest point.
 */
export function inradius(ring: Vec2[], samples = 24): { x: number; z: number; r: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }

  let best = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, r: 0 }
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = minX + ((maxX - minX) * (i + 0.5)) / samples
      const z = minZ + ((maxZ - minZ) * (j + 0.5)) / samples
      if (!contains(ring, x, z)) continue
      const r = distanceToEdge(ring, x, z)
      if (r > best.r) best = { x, z, r }
    }
  }
  return best
}

function contains(ring: Vec2[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const zi = ring[i].z
    const xj = ring[j].x
    const zj = ring[j].z
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Shortest distance from an interior point to the ring's boundary. */
function distanceToEdge(ring: Vec2[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j].x
    const az = ring[j].z
    const bx = ring[i].x
    const bz = ring[i].z
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
    if (d < best) best = d
  }
  return best
}
