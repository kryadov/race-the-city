import { describe, it, expect } from 'vitest'
import { regionToOffscreen } from '../../src/ui/minimap'

describe('regionToOffscreen', () => {
  it('maps the region corner to the offscreen origin', () => {
    expect(regionToOffscreen({ x: -1000, z: -1000 }, 1000)).toEqual({ x: 0, y: 0 })
  })
  it('maps the centre to the offscreen centre', () => {
    expect(regionToOffscreen({ x: 0, z: 0 }, 1000)).toEqual({ x: 500, y: 500 })
  })
  it('places +x/+z toward larger offscreen coords', () => {
    const p = regionToOffscreen({ x: 200, z: 200 }, 1000)
    expect(p.x).toBeGreaterThan(500)
    expect(p.y).toBeGreaterThan(500)
  })
})
