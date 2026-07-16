import { describe, it, expect } from 'vitest'
import { formatPlace } from '../../src/ui/trialHud'

describe('formatPlace', () => {
  it('reads as a position in a field', () => {
    expect(formatPlace({ place: 2, of: 4 })).toBe('2 / 4')
  })
})
