import { describe, it, expect } from 'vitest'
import { bboxKey } from '../../src/geo/cache'

describe('bboxKey', () => {
  it('is stable and rounded for near-identical bboxes', () => {
    const a = bboxKey({ south: 41.710001, west: 44.820001, north: 41.72, east: 44.83 })
    const b = bboxKey({ south: 41.710002, west: 44.820002, north: 41.72, east: 44.83 })
    expect(a).toBe(b)
  })
  it('differs for clearly different bboxes', () => {
    const a = bboxKey({ south: 41.71, west: 44.82, north: 41.72, east: 44.83 })
    const b = bboxKey({ south: 40.71, west: 43.82, north: 40.72, east: 43.83 })
    expect(a).not.toBe(b)
  })
})
