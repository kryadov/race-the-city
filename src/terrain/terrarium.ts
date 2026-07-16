import type { LatLon, Vec2 } from '../geo/types'
import type { Projector } from '../geo/project'
import type { BBox } from '../geo/overpass'
import type { ElevationProvider } from './provider'

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const TILE_SIZE = 256

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Global pixel coordinate (tileIndex*256 + inner) in the slippy-map grid. */
export function lonLatToTilePixel(lat: number, lon: number, zoom: number): { px: number; py: number } {
  const n = Math.pow(2, zoom)
  const x = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  return { px: x * TILE_SIZE, py: y * TILE_SIZE }
}

/** Bilinear sample of a row-major grid, clamped to edges. fx/fy in grid-cell units. */
export function sampleGrid(heights: Float32Array, w: number, h: number, fx: number, fy: number): number {
  const cx = Math.max(0, Math.min(w - 1, fx))
  const cy = Math.max(0, Math.min(h - 1, fy))
  const x0 = Math.floor(cx), y0 = Math.floor(cy)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const tx = cx - x0, ty = cy - y0
  const h00 = heights[y0 * w + x0], h10 = heights[y0 * w + x1]
  const h01 = heights[y1 * w + x0], h11 = heights[y1 * w + x1]
  const top = h00 + (h10 - h00) * tx
  const bot = h01 + (h11 - h01) * tx
  return top + (bot - top) * ty
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`tile load failed: ${url}`))
    img.src = url
  })
}

/**
 * Builds an elevation grid covering bbox by stitching Terrarium tiles into a
 * single decoded height array, then samples it per local (x,z).
 */
export async function loadTerrarium(
  _center: LatLon,
  bbox: BBox,
  projector: Projector,
  zoom = 14,
): Promise<ElevationProvider> {
  const nw = lonLatToTilePixel(bbox.north, bbox.west, zoom)
  const se = lonLatToTilePixel(bbox.south, bbox.east, zoom)
  const minTileX = Math.floor(nw.px / TILE_SIZE)
  const maxTileX = Math.floor(se.px / TILE_SIZE)
  const minTileY = Math.floor(nw.py / TILE_SIZE)
  const maxTileY = Math.floor(se.py / TILE_SIZE)

  const cols = maxTileX - minTileX + 1
  const rows = maxTileY - minTileY + 1
  const w = cols * TILE_SIZE
  const h = rows * TILE_SIZE
  const heights = new Float32Array(w * h)

  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const img = await loadImage(TILE_URL(zoom, tx, ty))
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
      const ox = (tx - minTileX) * TILE_SIZE
      const oy = (ty - minTileY) * TILE_SIZE
      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          const i = (py * TILE_SIZE + px) * 4
          heights[(oy + py) * w + (ox + px)] = decodeTerrarium(data[i], data[i + 1], data[i + 2])
        }
      }
    }
  }

  const originPx = minTileX * TILE_SIZE
  const originPy = minTileY * TILE_SIZE

  return {
    heightAt(x: number, z: number): number {
      const ll = projector.toLatLon({ x, z } as Vec2)
      const gp = lonLatToTilePixel(ll.lat, ll.lon, zoom)
      return sampleGrid(heights, w, h, gp.px - originPx, gp.py - originPy)
    },
  }
}
