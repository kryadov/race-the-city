import { describe, it, expect } from 'vitest'
import { nominatimUrl, parseNominatim } from '../../src/geo/geocode'

describe('nominatimUrl', () => {
  it('encodes the query and asks for json', () => {
    const url = nominatimUrl('Тбилиси')
    expect(url).toContain('format=json')
    expect(url).toContain(encodeURIComponent('Тбилиси'))
    expect(url).toContain('limit=1')
  })
})

describe('parseNominatim', () => {
  it('reads lat/lon from the first result', () => {
    const ll = parseNominatim([{ lat: '41.7151', lon: '44.8271' }])
    expect(ll.lat).toBeCloseTo(41.7151)
    expect(ll.lon).toBeCloseTo(44.8271)
  })
  it('throws when no results', () => {
    expect(() => parseNominatim([])).toThrow('city not found')
  })
})
