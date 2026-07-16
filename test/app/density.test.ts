import { describe, it, expect } from 'vitest'
import { countFor, crowdFor, gapFor, DENSITIES } from '../../src/app/density'

describe('density', () => {
  it('has a setting for each of few / some / many', () => {
    expect(DENSITIES).toEqual(['low', 'normal', 'high'])
  })

  it('leaves normal alone', () => {
    expect(countFor('normal', 16)).toBe(16)
    expect(crowdFor('normal', 22)).toBe(22)
  })

  it('gives the crowd more room at the top than the rest', () => {
    // Cars and people spread over the whole road network and are only kept near
    // the player, so a couple of dozen vanish into a big map. Trains are bounded
    // by the railways there are.
    expect(crowdFor('high', 16)).toBeGreaterThan(countFor('high', 16))
  })

  it('at least doubles the crowd at the top', () => {
    expect(crowdFor('high', 16)).toBeGreaterThanOrEqual(crowdFor('normal', 16) * 2)
  })

  it('thins everything out at the bottom', () => {
    expect(countFor('low', 16)).toBeLessThan(16)
    expect(crowdFor('low', 22)).toBeLessThan(22)
  })

  it('never empties the world entirely', () => {
    for (const d of DENSITIES) {
      expect(countFor(d, 1)).toBeGreaterThanOrEqual(1)
      expect(crowdFor(d, 1)).toBeGreaterThanOrEqual(1)
    }
  })

  it('brings aircraft over more often when busy', () => {
    expect(gapFor('high', 30)).toBeLessThan(gapFor('normal', 30))
    expect(gapFor('low', 30)).toBeGreaterThan(gapFor('normal', 30))
  })
})
