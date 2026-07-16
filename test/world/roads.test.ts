import { describe, it, expect } from 'vitest'
import { roadWidth } from '../../src/world/roads'

describe('roadWidth', () => {
  it('makes motorways wider than residential streets', () => {
    expect(roadWidth('motorway')).toBeGreaterThan(roadWidth('residential'))
  })
  it('makes paths the narrowest', () => {
    expect(roadWidth('path')).toBeLessThan(roadWidth('service'))
  })
  it('returns a positive width for every kind', () => {
    for (const k of ['motorway', 'primary', 'secondary', 'residential', 'service', 'path', 'other'] as const) {
      expect(roadWidth(k)).toBeGreaterThan(0)
    }
  })
})
