import { describe, it, expect } from 'vitest'
import { rpmFraction } from '../../src/ui/hud'

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
