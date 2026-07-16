import { describe, it, expect } from 'vitest'
import { classifyBuilding } from '../../src/geo/parse'

describe('classifyBuilding', () => {
  it('reads the building tag when it says something', () => {
    expect(classifyBuilding({ building: 'house' })).toBe('house')
    expect(classifyBuilding({ building: 'apartments' })).toBe('apartments')
    expect(classifyBuilding({ building: 'retail' })).toBe('retail')
    expect(classifyBuilding({ building: 'office' })).toBe('office')
    expect(classifyBuilding({ building: 'warehouse' })).toBe('industrial')
    expect(classifyBuilding({ building: 'church' })).toBe('civic')
  })

  it('believes the other tags on an untyped building', () => {
    // building=yes is the commonest tag in OSM and says nothing on its own
    expect(classifyBuilding({ building: 'yes', shop: 'bakery' })).toBe('retail')
    expect(classifyBuilding({ building: 'yes', amenity: 'cafe' })).toBe('retail')
    expect(classifyBuilding({ building: 'yes', office: 'lawyer' })).toBe('office')
    expect(classifyBuilding({ building: 'yes', amenity: 'school' })).toBe('civic')
  })

  it('lets the building tag win over a stray secondary tag', () => {
    expect(classifyBuilding({ building: 'house', office: 'lawyer' })).toBe('house')
  })

  it('falls back to apartments when nothing says otherwise', () => {
    expect(classifyBuilding({ building: 'yes' })).toBe('apartments')
    expect(classifyBuilding({})).toBe('apartments')
  })
})
