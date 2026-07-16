import { describe, it, expect } from 'vitest'
import { storeysIn } from '../../src/world/facadeUv'
import { FLOOR_H } from '../../src/world/facade'

describe('storeysIn', () => {
  it('fits a whole number of storeys, so the roof never slices a window row', () => {
    for (const h of [3, 4.1, 7.5, 12, 18.3, 40, 91.7]) {
      expect(Number.isInteger(storeysIn(h)), `${h}m`).toBe(true)
    }
  })

  it('keeps storeys near the nominal height', () => {
    // the stretch reads as generous or mean ceilings — never as a mezzanine
    for (let h = 3; h < 120; h += 0.7) {
      const floorH = h / storeysIn(h)
      expect(floorH, `${h}m`).toBeGreaterThan(FLOOR_H * 0.6)
      expect(floorH, `${h}m`).toBeLessThan(FLOOR_H * 1.7)
    }
  })

  it('gives even a shed one storey rather than none', () => {
    expect(storeysIn(0.5)).toBe(1)
    expect(storeysIn(0)).toBe(1)
    expect(storeysIn(-3)).toBe(1) // junk height must not invert the facade
  })

  it('grows with height', () => {
    expect(storeysIn(30)).toBeGreaterThan(storeysIn(10))
    expect(storeysIn(10)).toBeGreaterThan(storeysIn(4))
  })
})
