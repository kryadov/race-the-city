import { describe, it, expect } from 'vitest'
import { engineFrequency } from '../../src/audio/audio'

describe('engineFrequency', () => {
  it('idles low and rises with speed', () => {
    expect(engineFrequency(0)).toBeCloseTo(55)
    expect(engineFrequency(1)).toBeCloseTo(265)
    expect(engineFrequency(0.5)).toBeGreaterThan(engineFrequency(0.1))
  })

  it('clamps out-of-range speed fractions', () => {
    expect(engineFrequency(2)).toBeCloseTo(265)
    expect(engineFrequency(-1)).toBeCloseTo(55)
  })
})
