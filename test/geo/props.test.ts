import { describe, it, expect } from 'vitest'
import { classifyProp, isLandmark } from '../../src/geo/parse'

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

describe('isLandmark', () => {
  it('recognises tourism and historic sights', () => {
    expect(isLandmark({ tourism: 'attraction' })).toBe(true)
    expect(isLandmark({ tourism: 'museum' })).toBe(true)
    expect(isLandmark({ tourism: 'viewpoint' })).toBe(true)
    expect(isLandmark({ tourism: 'gallery' })).toBe(true)
    expect(isLandmark({ historic: 'castle' })).toBe(true)
    expect(isLandmark({ historic: 'ruins' })).toBe(true)
    // shared with statue props: still a landmark worth a beacon
    expect(isLandmark({ historic: 'monument' })).toBe(true)
    expect(isLandmark({ tourism: 'artwork' })).toBe(true)
  })

  it('leaves plain streets and shops alone', () => {
    expect(isLandmark({ tourism: 'hotel' })).toBe(false)
    expect(isLandmark({ historic: 'yes' })).toBe(false)
    expect(isLandmark({ amenity: 'cafe' })).toBe(false)
    expect(isLandmark({})).toBe(false)
  })
})
