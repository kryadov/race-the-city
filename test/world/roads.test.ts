import { describe, it, expect } from 'vitest'
import { roadWidth, offsetsForPolyline } from '../../src/world/roads'

describe('roadWidth', () => {
  it('makes motorways wider than residential streets', () => {
    expect(roadWidth('motorway')).toBeGreaterThan(roadWidth('residential'))
  })
  it('makes paths the narrowest', () => {
    expect(roadWidth('path')).toBeLessThan(roadWidth('service'))
  })
  it('returns a positive width for every kind', () => {
    for (const k of ['motorway', 'primary', 'secondary', 'residential', 'service', 'path', 'other'] as const) {
      expect(roadWidth(k)).toBeGreaterThan(0)
    }
  })
})

describe('offsetsForPolyline (mitered ribbon edges)', () => {
  it('returns nothing for a degenerate polyline', () => {
    expect(offsetsForPolyline([], 2)).toEqual([])
    expect(offsetsForPolyline([{ x: 0, z: 0 }], 2)).toEqual([])
  })

  it('offsets a straight run by exactly half-width on each side', () => {
    const s = offsetsForPolyline([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }], 2)
    expect(s).toHaveLength(3)
    const mid = s[1]
    expect(mid.left.x).toBeCloseTo(10)
    expect(mid.left.z).toBeCloseTo(2)
    expect(mid.right.z).toBeCloseTo(-2)
    // full ribbon width across the two sides
    expect(mid.left.z - mid.right.z).toBeCloseTo(4)
  })

  it('miters an interior corner so the joint stretches by 1/cos(half-angle)', () => {
    // right-angle turn: +x then +z; half-angle 45°, miter scale = √2
    const s = offsetsForPolyline([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], 2)
    const corner = s[1]
    // shared corner points pull inward/outward to close the seam
    expect(corner.left.x).toBeCloseTo(8)
    expect(corner.left.z).toBeCloseTo(2)
    expect(corner.right.x).toBeCloseTo(12)
    expect(corner.right.z).toBeCloseTo(-2)
    const miterLen = Math.hypot(corner.left.x - 10, corner.left.z - 0)
    expect(miterLen).toBeCloseTo(2 * Math.SQRT2) // hw * √2
  })

  it('clamps the miter on very sharp turns instead of spiking to infinity', () => {
    // near-180° hairpin: without a limit the miter would blow up
    const s = offsetsForPolyline([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 0.5 }], 2)
    const corner = s[1]
    const miterLen = Math.hypot(corner.left.x - 10, corner.left.z - 0)
    expect(miterLen).toBeLessThanOrEqual(2 * 4 + 1e-6) // hw * MITER_LIMIT
  })
})
