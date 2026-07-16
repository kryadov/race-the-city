import { describe, it, expect } from 'vitest'
import { sunElevation, sampleDayNight } from '../../src/app/daynight'

describe('day/night', () => {
  it('puts the sun high at noon and below at midnight', () => {
    expect(sunElevation(0.5)).toBeGreaterThan(0.9)
    expect(sunElevation(0)).toBeLessThan(-0.9)
    expect(sunElevation(0.25)).toBeCloseTo(0, 5) // dawn on the horizon
  })

  it('is brighter at noon than at midnight', () => {
    expect(sampleDayNight(0.5).sunI).toBeGreaterThan(sampleDayNight(0).sunI)
    expect(sampleDayNight(0.5).ambI).toBeGreaterThan(sampleDayNight(0).ambI)
  })

  it('wraps time past 1', () => {
    expect(sampleDayNight(1.5).sky).toBe(sampleDayNight(0.5).sky)
  })
})
