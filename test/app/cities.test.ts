import { describe, it, expect } from 'vitest'
import { CITY_REGIONS, RANDOM_CITIES, pickRandomCity } from '../../src/app/cities'

/** Which region a city belongs to. */
const regionOf = (city: string): number => CITY_REGIONS.findIndex((r) => r.includes(city))

describe('the city list', () => {
  it('covers the world, not just Europe', () => {
    // it was 25 cities, 16 of them European, one in East Asia and none in
    // China, Korea, India or Russia
    for (const must of [
      'Tokyo, Japan',
      'Seoul, South Korea',
      'Shanghai, China',
      'Delhi, India',
      'Moscow, Russia',
      'Saint Petersburg, Russia',
      'Cairo, Egypt',
      'Sydney, Australia',
      'Lima, Peru',
    ]) {
      expect(RANDOM_CITIES, must).toContain(must)
    }
  })

  it('lists no city twice', () => {
    expect(new Set(RANDOM_CITIES).size).toBe(RANDOM_CITIES.length)
  })

  it('has no empty region', () => {
    for (const r of CITY_REGIONS) expect(r.length).toBeGreaterThan(0)
  })
})

describe('pickRandomCity', () => {
  it('returns a city from the list', () => {
    for (let i = 0; i < 200; i++) expect(RANDOM_CITIES).toContain(pickRandomCity())
  })

  it('avoids the city you are already in', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickRandomCity('Monte Carlo')).not.toBe('Monte Carlo')
    }
  })

  it('gives every region a real turn, not just the longest one', () => {
    // The old flat list picked in proportion to entries, and any list written by
    // hand is mostly European — so that is all the button ever gave you.
    const hits = new Array(CITY_REGIONS.length).fill(0)
    for (let i = 0; i < 4000; i++) hits[regionOf(pickRandomCity())]++
    const expected = 4000 / CITY_REGIONS.length
    for (let r = 0; r < hits.length; r++) {
      expect(hits[r], `region ${r} is starved`).toBeGreaterThan(expected * 0.6)
      expect(hits[r], `region ${r} hogs the draw`).toBeLessThan(expected * 1.6)
    }
  })

  it('does not favour Europe over Asia any more', () => {
    let europe = 0
    let asia = 0
    for (let i = 0; i < 4000; i++) {
      const r = regionOf(pickRandomCity())
      if (r === 0 || r === 1) europe++
      if (r === 3 || r === 4) asia++
    }
    expect(Math.abs(europe - asia) / 4000, 'still lopsided').toBeLessThan(0.06)
  })

  it('is deterministic when handed a fixed rand', () => {
    expect(pickRandomCity(undefined, () => 0)).toBe(pickRandomCity(undefined, () => 0))
  })
})
