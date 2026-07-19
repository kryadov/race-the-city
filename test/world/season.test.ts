import { describe, it, expect } from 'vitest'
import { season, type SeasonName } from '../../src/world/season'

/** The season name for a 0-based month at a latitude. Day-of-month is irrelevant
 * — meteorological seasons run on whole calendar months — so we pick the 15th. */
const nameAt = (month: number, lat: number): SeasonName => season(new Date(2026, month, 15), lat).name

// month index -> northern-hemisphere season. The southern hemisphere is this
// list rotated by six months (Jan in Sydney is high summer).
const NORTH: SeasonName[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
]

const LONDON = 51.5
const SYDNEY = -33.87

/** [h,s,l] of a packed 0xRRGGBB, matching season.ts's own conversion. */
function hsl(rgb: number): [number, number, number] {
  const r = ((rgb >> 16) & 255) / 255
  const g = ((rgb >> 8) & 255) / 255
  const b = (rgb & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}
const red = (rgb: number): number => (rgb >> 16) & 255
const green = (rgb: number): number => (rgb >> 8) & 255

const BASE = 0x4f8a3a // greenery's broadleaf crown

describe('season() month -> season mapping', () => {
  it('runs the northern calendar north of the equator', () => {
    for (let m = 0; m < 12; m++) expect(nameAt(m, LONDON), `month ${m}`).toBe(NORTH[m])
  })

  it('flips the calendar by six months south of the equator', () => {
    for (let m = 0; m < 12; m++) expect(nameAt(m, SYDNEY), `month ${m}`).toBe(NORTH[(m + 6) % 12])
  })

  it('puts the hemispheres in opposite seasons on the same date', () => {
    // July: London bakes, Sydney shivers.
    expect(nameAt(6, LONDON)).toBe('summer')
    expect(nameAt(6, SYDNEY)).toBe('winter')
    // January: the other way round.
    expect(nameAt(0, LONDON)).toBe('winter')
    expect(nameAt(0, SYDNEY)).toBe('summer')
  })

  it('treats the equator (lat 0) as northern', () => {
    expect(nameAt(0, 0)).toBe('winter')
    expect(nameAt(6, 0)).toBe('summer')
  })
})

describe('season() crown palette', () => {
  const spring = season(new Date(2026, 3, 15), LONDON)
  const summer = season(new Date(2026, 6, 15), LONDON)
  const autumn = season(new Date(2026, 9, 15), LONDON)
  const winter = season(new Date(2026, 0, 15), LONDON)

  it('leaves summer crowns exactly as their base green', () => {
    expect(summer.name).toBe('summer')
    expect(summer.crown(BASE, 0.3)).toBe(BASE)
  })

  it('brightens spring crowns above the summer base', () => {
    const [, sBase, lBase] = hsl(BASE)
    const [, s, l] = hsl(spring.crown(BASE, 0.5))
    expect(l, 'lighter').toBeGreaterThan(lBase)
    expect(s, 'more saturated').toBeGreaterThan(sBase)
  })

  it('turns autumn crowns warm — red past green — and varies across a stand', () => {
    for (const r of [0, 0.5, 1]) {
      const c = autumn.crown(BASE, r)
      expect(red(c), `warm at r=${r}`).toBeGreaterThan(green(BASE))
      expect(red(c), `red >= green at r=${r}`).toBeGreaterThanOrEqual(green(c))
    }
    // r sweeps the warm arc, so the ends of a stand are different colours.
    expect(autumn.crown(BASE, 0)).not.toBe(autumn.crown(BASE, 1))
  })

  it('drains winter crowns to a pale grey-green', () => {
    const [hBase, sBase] = hsl(BASE)
    const [h, s, l] = hsl(winter.crown(BASE, 0.5))
    expect(s, 'far less saturated').toBeLessThan(sBase)
    expect(Math.abs(h - hBase), 'keeps the tree hue').toBeLessThan(0.03)
    expect(l, 'lifted toward snow').toBeGreaterThan(0.45)
  })

  it('is deterministic — same date, latitude and r give the same colour', () => {
    const a = season(new Date(2026, 9, 15), LONDON).crown(BASE, 0.42)
    const b = season(new Date(2026, 9, 15), LONDON).crown(BASE, 0.42)
    expect(a).toBe(b)
  })
})

describe('season() blossom, snow and grass', () => {
  const of = (m: number): ReturnType<typeof season> => season(new Date(2026, m, 15), LONDON)

  it('only blossoms in spring', () => {
    expect(of(3).blossomChance).toBeGreaterThan(0) // April
    for (const m of [6, 9, 0]) expect(of(m).blossomChance).toBe(0)
  })

  it('only snows in winter', () => {
    expect(of(0).snow).toBeGreaterThan(0) // January
    for (const m of [3, 6, 9]) expect(of(m).snow).toBe(0)
  })

  it('gives every season its own grass tint', () => {
    const grasses = [of(0), of(3), of(6), of(9)].map((s) => s.grass)
    expect(new Set(grasses).size, 'four distinct greens').toBe(4)
  })
})
