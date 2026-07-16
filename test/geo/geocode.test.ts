import { describe, it, expect } from 'vitest'
import { nominatimUrl, parseNominatim } from '../../src/geo/geocode'

describe('nominatimUrl', () => {
  it('encodes the query and asks for json', () => {
    const url = nominatimUrl('Тбилиси')
    expect(url).toContain('format=json')
    expect(url).toContain(encodeURIComponent('Тбилиси'))
  })

  it('asks for several hits, so the settlement can be picked over the boundary', () => {
    expect(nominatimUrl('Москва')).toMatch(/limit=([2-9]|\d\d)/)
  })
})

describe('parseNominatim', () => {
  it('reads lat/lon from the only result', () => {
    const ll = parseNominatim([{ lat: '41.7151', lon: '44.8271' }])
    expect(ll.lat).toBeCloseTo(41.7151)
    expect(ll.lon).toBeCloseTo(44.8271)
  })

  it('throws when no results', () => {
    expect(() => parseNominatim([])).toThrow('city not found')
  })

  it('prefers the settlement over the administrative boundary', () => {
    // Real Nominatim output for "санкт-петербург". The boundary is the whole
    // federal subject and its centroid sits in the Gulf of Finland — loading a
    // 1km radius there gives open water in every direction.
    const ll = parseNominatim([
      { lat: '59.9606739', lon: '30.1586551', class: 'boundary', type: 'administrative' },
      { lat: '59.9387320', lon: '30.3162290', class: 'place', type: 'city' },
    ])
    expect(ll.lat).toBeCloseTo(59.9387)
    expect(ll.lon).toBeCloseTo(30.3162)
  })

  it('takes towns and villages too, not just cities', () => {
    const ll = parseNominatim([
      { lat: '1', lon: '1', class: 'boundary', type: 'administrative' },
      { lat: '2', lon: '2', class: 'place', type: 'village' },
    ])
    expect(ll.lat).toBeCloseTo(2)
  })

  it('ignores place hits that are not settlements', () => {
    // class=place type=locality matches unrelated specks in Altai and Belarus
    const ll = parseNominatim([
      { lat: '1', lon: '1', class: 'boundary', type: 'administrative' },
      { lat: '2', lon: '2', class: 'place', type: 'locality' },
    ])
    expect(ll.lat).toBeCloseTo(1)
  })

  it('takes the boundary over an unrelated top hit', () => {
    // Real shape of "Кронштадт": an aerodrome outranks the town, which is only
    // reachable through its boundary.
    const ll = parseNominatim([
      { lat: '60.0151', lon: '29.7078', class: 'aeroway', type: 'aerodrome' },
      { lat: '56.7588', lon: '37.1118', class: 'landuse', type: 'industrial' },
      { lat: '59.9908', lon: '29.7747', class: 'boundary', type: 'administrative' },
    ])
    expect(ll.lat).toBeCloseTo(59.9908)
    expect(ll.lon).toBeCloseTo(29.7747)
  })

  it('falls back to the first hit when there is nothing better', () => {
    const ll = parseNominatim([
      { lat: '48.8584', lon: '2.2945', class: 'tourism', type: 'attraction' },
    ])
    expect(ll.lat).toBeCloseTo(48.8584)
  })
})
