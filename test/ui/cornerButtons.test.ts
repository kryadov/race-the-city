import { describe, it, expect } from 'vitest'
import { cornerRight, CORNER_EDGE, CORNER_SIZE, CORNER_GAP } from '../../src/ui/cornerButtons'

describe('cornerRight', () => {
  it('sits the first button flush against the edge', () => {
    expect(cornerRight(0)).toBe(CORNER_EDGE) // 16 — no drift in from the corner
  })

  it('packs each next button one width-plus-gap further in', () => {
    // pause at slot 0, help at slot 1 — the two survivors of the old three-button row.
    expect(cornerRight(1)).toBe(CORNER_EDGE + CORNER_SIZE + CORNER_GAP) // 68
    expect(cornerRight(2)).toBe(CORNER_EDGE + 2 * (CORNER_SIZE + CORNER_GAP)) // 120
  })

  it('never lets adjacent buttons overlap', () => {
    for (let i = 0; i < 5; i++) {
      // the next button starts at least a full width further out — no overlap
      expect(cornerRight(i + 1) - cornerRight(i)).toBeGreaterThanOrEqual(CORNER_SIZE)
    }
  })

  it('marches monotonically inward from the edge', () => {
    expect(cornerRight(0)).toBeLessThan(cornerRight(1))
    expect(cornerRight(1)).toBeLessThan(cornerRight(2))
  })
})
