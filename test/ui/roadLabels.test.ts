import { describe, it, expect } from 'vitest'
import { labelHeight } from '../../src/ui/roadLabels'
import type { Road } from '../../src/geo/types'
import type { DeckIndex } from '../../src/world/bridge'

const road = (bridge: boolean): Road => ({ kind: 'primary', points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], bridge })
const ground = { heightAt: () => 3 } // terrain sits at 3m
const deckAt = (y: number | null): DeckIndex => ({ heightAt: () => y })

describe('labelHeight', () => {
  it('sits a normal road name on the terrain', () => {
    expect(labelHeight(road(false), 5, 0, ground, deckAt(20))).toBe(3 + 1) // deck ignored off a bridge
  })

  it('rides a bridge road name on its deck, not the ground far below', () => {
    expect(labelHeight(road(true), 5, 0, ground, deckAt(20))).toBe(20 + 1)
  })

  it('falls back to the ground when a bridge road has no deck over the point', () => {
    expect(labelHeight(road(true), 5, 0, ground, deckAt(null))).toBe(3 + 1)
  })

  it('falls back to the ground when no deck index is given', () => {
    expect(labelHeight(road(true), 5, 0, ground)).toBe(3 + 1)
  })
})
