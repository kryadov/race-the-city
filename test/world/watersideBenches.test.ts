import { describe, it, expect } from 'vitest'
import { watersideBenchSpots, benchFacing } from '../../src/world/watersideBenches'
import { isOverWater } from '../../src/world/waterArea'
import type { Vec2 } from '../../src/geo/types'

/** A closed axis-aligned rectangle ring covering [x0,x1] × [z0,z1]. */
const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
]

const rng = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('watersideBenchSpots', () => {
  const lake = [rect(-100, -100, 100, 100)] // a 200m square of water, land all around it

  it('places benches, on dry land, never over the water', () => {
    const spots = watersideBenchSpots(lake, [], 1000, rng(1))
    expect(spots.length).toBeGreaterThan(0)
    for (const s of spots) {
      expect(isOverWater(s.x, s.z, lake, [])).toBe(false) // on the bank, not in the lake
    }
  })

  it('seats them just outside the shoreline, on the near bank', () => {
    const spots = watersideBenchSpots(lake, [], 1000, rng(2))
    for (const s of spots) {
      // each sits a few metres outside the 100m-half water square (on land)…
      const outside = Math.max(Math.abs(s.x), Math.abs(s.z)) > 100
      expect(outside).toBe(true)
      // …but only a few metres out, not stranded inland
      expect(Math.max(Math.abs(s.x), Math.abs(s.z))).toBeLessThan(100 + 6)
    }
  })

  it('faces each bench toward the water it sits beside', () => {
    const spots = watersideBenchSpots(lake, [], 1000, rng(3))
    for (const s of spots) {
      const f = benchFacing(s.yaw)
      // the water (the lake) is toward the origin from a bank seat, so the facing
      // should point roughly back toward the centre — a positive dot with (−pos).
      const toWater = { x: -s.x, z: -s.z }
      const tl = Math.hypot(toWater.x, toWater.z) || 1
      const dot = f.x * (toWater.x / tl) + f.z * (toWater.z / tl)
      expect(dot).toBeGreaterThan(0.5) // facing the water, not along or away from it
    }
  })

  it('keeps benches on an island (a water hole) rather than calling it water', () => {
    // A big lake with an island; the island's own bank isn't walked (holes aren't
    // outer rings), but a bench stepped toward the island counts the island as land.
    const withIsland = watersideBenchSpots(lake, [rect(-20, -20, 20, 20)], 1000, rng(4))
    for (const s of withIsland) expect(isOverWater(s.x, s.z, lake, [rect(-20, -20, 20, 20)])).toBe(false)
  })

  it('drops spots that fall off the edge of the map', () => {
    // A tiny reach clips the bank seats that sit outside it.
    const spots = watersideBenchSpots(lake, [], 101, rng(5))
    for (const s of spots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(101)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(101)
    }
  })

  it('is empty when there is no water', () => {
    expect(watersideBenchSpots([], [], 1000, rng(6))).toEqual([])
  })

  it('caps how many line a very long shore', () => {
    const hugeLake = [rect(-900, -900, 900, 900)] // ~7km of perimeter
    expect(watersideBenchSpots(hugeLake, [], 1000, rng(7)).length).toBeLessThanOrEqual(40)
  })
})
