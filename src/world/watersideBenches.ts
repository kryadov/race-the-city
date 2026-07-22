import type { Vec2 } from '../geo/types'
import { isOverWater } from './waterArea'

/**
 * Benches set along the water's edge, facing out over it — the embankment seats
 * you find down the Seine or round a lake, where people sit to watch the water.
 *
 * This is the placement only (pure, tested): it walks each water body's outline,
 * drops a seat every so often, steps it back onto the dry side, and faces it at
 * the water. streetFurniture.ts draws these as ordinary benches, forced occupied
 * (someone's always there for the view). The full "walk up and sit down" is a
 * follow-up; this puts the benches — and the people on them — by the water.
 */

/** A placed waterside bench: where it stands and the yaw it faces (at the water). */
export interface WatersideBench {
  x: number
  z: number
  yaw: number
}

/** Metres back from the waterline onto land the bench stands. */
const SET_BACK = 3
/** Metres along the shore between benches. */
const SPACING = 34
/** Map-wide cap, so a long river doesn't line the whole bank. */
const CAP = 40

/**
 * Bench spots along the edges of the given water bodies, on the land side and
 * facing the water. `holes` are the islands (so a bench on an island shore is on
 * land, not "in the water"); `reach` is the map half-extent — spots past it are
 * dropped so none floats off the edge of the world. `rand` only staggers where
 * each ring's run begins, so the layout is stable given a seeded source.
 */
export function watersideBenchSpots(
  water: Vec2[][],
  holes: Vec2[][],
  reach: number,
  rand: () => number = Math.random,
): WatersideBench[] {
  const out: WatersideBench[] = []
  for (const ring of water) {
    if (ring.length < 3) continue
    let carry = SPACING * (0.3 + rand() * 0.7) // stagger the first seat on this ring
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) continue
      const ux = dx / len
      const uz = dz / len
      const px = -uz // perpendicular to the shore
      const pz = ux
      let d = carry
      for (; d < len; d += SPACING) {
        if (out.length >= CAP) return out
        const mx = a.x + ux * d // a point on the shoreline
        const mz = a.z + uz * d
        // Step back onto whichever side is dry land (one side is water, inside the
        // outline; the other is the bank — or an island, which the holes exclude).
        const px1 = mx + px * SET_BACK
        const pz1 = mz + pz * SET_BACK
        const px2 = mx - px * SET_BACK
        const pz2 = mz - pz * SET_BACK
        let lx: number
        let lz: number
        if (!isOverWater(px1, pz1, water, holes)) {
          lx = px1
          lz = pz1
        } else if (!isOverWater(px2, pz2, water, holes)) {
          lx = px2
          lz = pz2
        } else {
          continue // both sides wet — a channel too narrow to sit beside
        }
        if (Math.abs(lx) > reach || Math.abs(lz) > reach) continue // off the map
        // Face the water: the seated figure looks along the bench's local −Z, which
        // a yaw about +Y sends to world (−sinθ, −cosθ). Aim that at the waterline.
        const wx = mx - lx
        const wz = mz - lz
        const wl = Math.hypot(wx, wz) || 1
        const yaw = Math.atan2(-wx / wl, -wz / wl)
        out.push({ x: lx, z: lz, yaw })
      }
      carry = d - len
    }
  }
  return out
}

/** The world direction a bench at this yaw seats a person to face — world (x,z).
 *  Exposed so the placement's "faces the water" intent can be asserted in a test. */
export function benchFacing(yaw: number): Vec2 {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}
