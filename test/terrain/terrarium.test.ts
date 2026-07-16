import { describe, it, expect } from 'vitest'
import { decodeTerrarium, lonLatToTilePixel, sampleGrid } from '../../src/terrain/terrarium'

describe('decodeTerrarium', () => {
  it('decodes sea level (0m) from the reference encoding', () => {
    // 0m => value 32768 => R=128, G=0, B=0
    expect(decodeTerrarium(128, 0, 0)).toBeCloseTo(0, 3)
  })
  it('decodes a positive elevation', () => {
    // 1000m => 33768 => R=131 (131*256=33536), G=232, B=0 => 33768-32768=1000
    expect(decodeTerrarium(131, 232, 0)).toBeCloseTo(1000, 3)
  })
})

describe('lonLatToTilePixel', () => {
  it('is monotonic: east increases px, north decreases py', () => {
    const a = lonLatToTilePixel(41.7151, 44.8271, 14)
    const east = lonLatToTilePixel(41.7151, 44.8371, 14)
    const north = lonLatToTilePixel(41.7251, 44.8271, 14)
    expect(east.px).toBeGreaterThan(a.px)
    expect(north.py).toBeLessThan(a.py)
  })
})

describe('sampleGrid (bilinear)', () => {
  const heights = new Float32Array([0, 10, 0, 10]) // 2x2: left col 0, right col 10
  it('returns exact grid values at integer coords', () => {
    expect(sampleGrid(heights, 2, 2, 0, 0)).toBeCloseTo(0)
    expect(sampleGrid(heights, 2, 2, 1, 0)).toBeCloseTo(10)
  })
  it('interpolates between columns', () => {
    expect(sampleGrid(heights, 2, 2, 0.5, 0)).toBeCloseTo(5)
  })
  it('clamps out-of-range coordinates', () => {
    expect(sampleGrid(heights, 2, 2, -5, -5)).toBeCloseTo(0)
    expect(sampleGrid(heights, 2, 2, 99, 99)).toBeCloseTo(10)
  })
})
