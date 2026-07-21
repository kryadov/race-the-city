import { describe, it, expect } from 'vitest'
import { rpmFraction, HUD_STACK } from '../../src/ui/hud'

describe('rpmFraction', () => {
  it('idles at the bottom of the sweep', () => {
    expect(rpmFraction(0)).toBe(0)
  })
  it('climbs as the engine revs, moving the needle', () => {
    expect(rpmFraction(4000)).toBeGreaterThan(rpmFraction(1000))
  })
  it('pins at full scale past redline', () => {
    expect(rpmFraction(99999)).toBe(1)
  })
  it('never points below idle', () => {
    expect(rpmFraction(-500)).toBe(0)
  })
})

describe('HUD_STACK order', () => {
  it('puts the city name under the speedometer', () => {
    expect(HUD_STACK.indexOf('city')).toBeGreaterThan(HUD_STACK.indexOf('speedo'))
  })

  it('keeps the tacho above the speedo (one instrument cluster)', () => {
    expect(HUD_STACK.indexOf('tacho')).toBeLessThan(HUD_STACK.indexOf('speedo'))
  })

  it('tucks the pause-only debug readout at the very bottom', () => {
    expect(HUD_STACK.indexOf('debug')).toBe(HUD_STACK.length - 1)
  })
})
