import { describe, it, expect } from 'vitest'
import { bboxAround, overpassQuery } from '../../src/geo/overpass'

describe('bboxAround', () => {
  it('builds a symmetric box around the center', () => {
    const b = bboxAround({ lat: 41.7151, lon: 44.8271 }, 1000)
    expect(b.south).toBeLessThan(41.7151)
    expect(b.north).toBeGreaterThan(41.7151)
    expect(b.west).toBeLessThan(44.8271)
    expect(b.east).toBeGreaterThan(44.8271)
    // ~1km north offset is ~0.009 deg lat
    expect(b.north - 41.7151).toBeCloseTo(0.009, 2)
  })
})

describe('overpassQuery', () => {
  const q = overpassQuery({ south: 41.71, west: 44.82, north: 41.72, east: 44.83 })
  it('requests highways and buildings within the bbox', () => {
    expect(q).toContain('41.71,44.82,41.72,44.83')
    expect(q).toContain('highway')
    expect(q).toContain('building')
    expect(q).toContain('out')
  })
  it('asks for json output', () => {
    expect(q).toContain('[out:json]')
  })
})
