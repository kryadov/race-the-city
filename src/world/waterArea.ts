import type { Vec2 } from '../geo/types'
import { pointInPolygon } from '../physics/collide'

/**
 * Is (x,z) out over open water? True when it falls inside a water body's outline
 * but NOT inside one of that water's islands (a `waterHole` inner ring — like the
 * Île de la Cité sitting in the Seine, or Gezira in the Nile).
 *
 * The distinction matters everywhere land and water are told apart from the OSM
 * outlines alone: benches and bus stops that land here are dropped, boats keep
 * off, pedestrians are steered off or hidden. Reading only the outer outline
 * counts an island as water and wrongly banishes everything standing on it — so
 * this subtracts the holes. Pure, so it is tested once and shared.
 */
export function isOverWater(x: number, z: number, water: Vec2[][], holes: Vec2[][]): boolean {
  let inWater = false
  for (const ring of water) {
    if (ring.length >= 3 && pointInPolygon(x, z, ring)) {
      inWater = true
      break
    }
  }
  if (!inWater) return false
  // On an island cut out of the water body → dry land.
  for (const hole of holes) {
    if (hole.length >= 3 && pointInPolygon(x, z, hole)) return false
  }
  return true
}
