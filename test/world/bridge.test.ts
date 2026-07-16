import { describe, it, expect } from 'vitest'
import {
  deckHeights,
  arcParams,
  buildDecks,
  createDeckIndex,
  surfaceUnder,
  CLEARANCE,
  LAYER_H,
  MAX_ARCH,
} from '../../src/world/bridge'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }

/** A 100m bridge running along x, sampled every 10m. */
const span = (kind: Road['kind'] = 'primary', layer?: number): Road => {
  const points: Vec2[] = []
  for (let x = 0; x <= 100; x += 10) points.push(v(x, 0))
  const r: Road = { points, kind, bridge: true }
  if (layer !== undefined) r.layer = layer
  return r
}

describe('arcParams', () => {
  it('runs 0 to 1 along the line', () => {
    const s = arcParams([v(0, 0), v(10, 0), v(30, 0)])
    expect(s[0]).toBe(0)
    expect(s[2]).toBe(1)
    expect(s[1]).toBeCloseTo(1 / 3)
  })

  it('survives a polyline of one repeated point', () => {
    expect(arcParams([v(5, 5), v(5, 5)]).every((n) => Number.isFinite(n))).toBe(true)
  })
})

describe('deckHeights', () => {
  it('meets the ground at both ends, so you can drive on', () => {
    // a deck stamped at a fixed height leaves a step at the approach
    const y = deckHeights(span('primary', 1), flat)
    expect(y[0]).toBeCloseTo(0)
    expect(y[y.length - 1]).toBeCloseTo(0)
  })

  it('arches over the middle when layer says it is an overpass', () => {
    const y = deckHeights(span('primary', 1), flat)
    const mid = y[Math.floor(y.length / 2)]
    expect(mid).toBeCloseTo(LAYER_H, 0)
    expect(mid).toBeGreaterThan(y[0])
  })

  it('stays nearly flat over a river, whose banks are already above the water', () => {
    const y = deckHeights(span(), flat) // no layer, flat ground
    for (const h of y) expect(h).toBeCloseTo(0, 5)
  })

  it('rises to clear ground that pokes through the chord', () => {
    // a hill mid-span: the deck must go over it, not through it
    const hill = { heightAt: (x: number) => (x > 40 && x < 60 ? 8 : 0) }
    const y = deckHeights(span(), hill)
    const mid = y[5] // x = 50
    expect(mid).toBeGreaterThanOrEqual(8 + CLEARANCE - 0.001)
  })

  it('follows a slope from one bank up to the other', () => {
    const ramp = { heightAt: (x: number) => x * 0.1 } // 0m -> 10m across the span
    const y = deckHeights(span(), ramp)
    expect(y[0]).toBeCloseTo(0)
    expect(y[y.length - 1]).toBeCloseTo(10)
  })

  it('refuses to launch a road into orbit on a silly layer', () => {
    const y = deckHeights(span('primary', 40), flat)
    expect(Math.max(...y)).toBeLessThanOrEqual(MAX_ARCH + 0.001)
  })
})

describe('deck index', () => {
  const decks = buildDecks([span('primary', 1)], flat)
  const idx = createDeckIndex(decks)

  it('reports a deck over the bridge and nothing beside it', () => {
    expect(idx.heightAt(50, 0)).toBeGreaterThan(1) // on the span, arched up
    expect(idx.heightAt(50, 60)).toBeNull() // well off to the side
    expect(idx.heightAt(-40, 0)).toBeNull() // before it starts
  })

  it('ignores roads that are not bridges', () => {
    const plain: Road = { points: [v(0, 0), v(50, 0)], kind: 'primary' }
    expect(createDeckIndex(buildDecks([plain], flat)).heightAt(25, 0)).toBeNull()
  })
})

describe('surfaceUnder', () => {
  const idx = createDeckIndex(buildDecks([span('primary', 1)], flat))
  const deckY = idx.heightAt(50, 0)!

  it('keeps the car under the bridge it is driving beneath', () => {
    // the whole point: at ground level, a deck 5m overhead must not grab the car
    expect(surfaceUnder(50, 0, 0, 0, idx)).toBe(0)
  })

  it('carries the car along a deck it is already on', () => {
    expect(surfaceUnder(50, 0, deckY, 0, idx)).toBeCloseTo(deckY)
  })

  it('lets the car climb on at the end, where the deck meets the ground', () => {
    // at x=5 the deck is barely off the ground, so a car at ground level is on it
    const near = idx.heightAt(5, 0)!
    expect(surfaceUnder(5, 0, 0, 0, idx)).toBeCloseTo(near)
  })

  it('drops the car back to the ground once clear of the bridge', () => {
    expect(surfaceUnder(300, 0, deckY, 3, idx)).toBe(3)
  })
})
