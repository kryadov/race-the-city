import { describe, it, expect } from 'vitest'
import { Projector } from '../../src/geo/project'
import { lonLatToTilePixel } from '../../src/terrain/terrarium'

/**
 * The map's elevation geometry must be exact at every latitude, or slopes come
 * out wrong. It was suspected (TODO) that Web Mercator's cos(lat) shrink was
 * being missed, making high-latitude cities like Helsinki and St Petersburg come
 * out twice as steep as life. Measured here, it is NOT: the projector's cos(lat0)
 * longitude scale cancels through the Mercator tile-pixel mapping, so a local
 * step spans exactly its own length in real ground metres — at 0°, 35°, 51° and
 * 60°N alike. Any remaining exaggeration lives in the DEM source values or in
 * perception, not in this projection. This test guards that against a future
 * change to the projector or the tile mapping reintroducing a latitude skew.
 */
const EARTH_CIRCUMFERENCE = 40075016.686 // metres
const groundPerPixel = (lat: number, zoom: number): number =>
  (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom * 256)

/** Real ground metres the DEM sampling spans for a local (dx,dz) step. */
function impliedGroundDist(lat0: number, dx: number, dz: number, zoom = 14): number {
  const p = new Projector({ lat: lat0, lon: 25 })
  const a = p.toLatLon({ x: 0, z: 0 })
  const b = p.toLatLon({ x: dx, z: dz })
  const pa = lonLatToTilePixel(a.lat, a.lon, zoom)
  const pb = lonLatToTilePixel(b.lat, b.lon, zoom)
  return Math.hypot(pb.px - pa.px, pb.py - pa.py) * groundPerPixel(lat0, zoom)
}

describe('elevation geometry is exact at every latitude', () => {
  for (const lat of [0, 35, 51, 60]) {
    it(`a local 500m step spans ~500 real ground metres at ${lat}°N`, () => {
      expect(impliedGroundDist(lat, 500, 0)).toBeCloseTo(500, 0) // east–west
      expect(impliedGroundDist(lat, 0, 500)).toBeCloseTo(500, 0) // north–south
    })
  }
})
