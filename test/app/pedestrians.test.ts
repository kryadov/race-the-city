import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { dressForSeason } from '../../src/app/pedestrians'
import type { SeasonName } from '../../src/world/season'

// The winter warm anchor, mirrored from pedestrians.ts (season.test.ts likewise
// duplicates its little HSL helper rather than reaching into the module).
const WARM = 0.08
// [h,s,l] of a packed colour, read the same way pedestrians.ts writes it — via
// THREE.Color — so the numbers line up channel for channel.
const hsl = (hex: number): { h: number; s: number; l: number } => {
  const out = { h: 0, s: 0, l: 0 }
  new THREE.Color(hex).getHSL(out)
  return out
}
// Distance between two hues round the wheel, taking the shorter arc.
const hueArc = (a: number, b: number): number => {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

const SHIRT = 0x3a6ea5 // a cool mid blue from the crowd's palette
const SEASONS: SeasonName[] = ['spring', 'summer', 'autumn', 'winter']

describe('dressForSeason', () => {
  it('is deterministic — same colour and season give the same result', () => {
    for (const s of SEASONS) expect(dressForSeason(SHIRT, s)).toBe(dressForSeason(SHIRT, s))
  })

  it('lightens for summer and darkens for winter, spring/autumn between', () => {
    const base = hsl(SHIRT).l
    const summer = hsl(dressForSeason(SHIRT, 'summer')).l
    const spring = hsl(dressForSeason(SHIRT, 'spring')).l
    const autumn = hsl(dressForSeason(SHIRT, 'autumn')).l
    const winter = hsl(dressForSeason(SHIRT, 'winter')).l
    // Summer is the light extreme, winter the dark one, and the crowd reads
    // noticeably different between them.
    expect(summer).toBeGreaterThan(base)
    expect(winter).toBeLessThan(base)
    expect(summer).toBeGreaterThan(winter + 0.15)
    // A monotone run from lightest to darkest.
    expect(summer).toBeGreaterThan(spring)
    expect(spring).toBeGreaterThan(autumn)
    expect(autumn).toBeGreaterThan(winter)
  })

  it('mutes winter clothes and brightens summer ones', () => {
    const base = hsl(SHIRT).s
    expect(hsl(dressForSeason(SHIRT, 'winter')).s, 'muted').toBeLessThan(base)
    expect(hsl(dressForSeason(SHIRT, 'summer')).s, 'crisp').toBeGreaterThan(base)
  })

  it('drags a cool colour toward warm in winter but leaves summer crisp', () => {
    const base = hueArc(hsl(SHIRT).h, WARM)
    // Winter pulls the blue a good way toward orange — much closer to the warm
    // anchor than it started.
    expect(base - hueArc(hsl(dressForSeason(SHIRT, 'winter')).h, WARM)).toBeGreaterThan(0.1)
    // Summer has no warm drag, so the hue barely moves — only 8-bit repacking
    // rounding, nowhere near winter's shift.
    expect(Math.abs(hueArc(hsl(dressForSeason(SHIRT, 'summer')).h, WARM) - base)).toBeLessThan(0.01)
  })

  it('keeps every packed result a valid 24-bit colour', () => {
    for (const s of SEASONS) {
      const c = dressForSeason(SHIRT, s)
      expect(Number.isInteger(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(0xffffff)
    }
  })
})
