import { describe, it, expect } from 'vitest'
import { classifyProp } from '../../src/geo/parse'

describe('classifyProp', () => {
  it('recognises the tags OSM actually uses', () => {
    expect(classifyProp({ amenity: 'fountain' })).toBe('fountain')
    expect(classifyProp({ historic: 'memorial' })).toBe('statue')
    expect(classifyProp({ historic: 'monument' })).toBe('statue')
    expect(classifyProp({ tourism: 'artwork' })).toBe('statue')
    expect(classifyProp({ landuse: 'flowerbed' })).toBe('flowerbed')
  })

  it('leaves everything else alone', () => {
    expect(classifyProp({ natural: 'tree' })).toBeNull()
    expect(classifyProp({ amenity: 'parking' })).toBeNull()
    expect(classifyProp({ building: 'house' })).toBeNull()
    expect(classifyProp({})).toBeNull()
  })
})
