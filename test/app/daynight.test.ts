import { describe, it, expect } from 'vitest'
import { sunElevation, sampleDayNight, breatheTime, DAY_TIME, NIGHT_TIME, BREATHE_PERIOD } from '../../src/app/daynight'

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

describe('breatheTime (day/night lock)', () => {
  it('sits exactly on the hold time at phase 0', () => {
    expect(breatheTime('day', 0)).toBeCloseTo(DAY_TIME)
    expect(breatheTime('night', 0)).toBeCloseTo(NIGHT_TIME)
  })

  it('keeps a day lock in daylight — the sun never dips below the horizon', () => {
    // Sweep a whole breathing cycle (and beyond): the sun must stay up the whole time.
    for (let p = 0; p <= BREATHE_PERIOD * 2.5; p += 1) {
      expect(sunElevation(breatheTime('day', p)), `phase ${p}`).toBeGreaterThan(0.2)
    }
  })

  it('keeps a night lock in the dark — the sun never rises', () => {
    for (let p = 0; p <= BREATHE_PERIOD * 2.5; p += 1) {
      expect(sunElevation(breatheTime('night', p)), `phase ${p}`).toBeLessThan(-0.2)
    }
  })

  it('actually breathes — the time drifts away from the hold and back', () => {
    const quarter = breatheTime('day', BREATHE_PERIOD / 4) // sine peak
    expect(quarter).toBeGreaterThan(DAY_TIME) // eased to one side
    expect(breatheTime('day', BREATHE_PERIOD / 2)).toBeCloseTo(DAY_TIME) // and back through centre
  })
})
