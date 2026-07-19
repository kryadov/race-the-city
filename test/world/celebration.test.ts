import { describe, it, expect } from 'vitest'
import { celebration, makeFireworkTimer, type FireworkBurst } from '../../src/world/celebration'

/** Deterministic PRNG (mulberry32) — the greenery.ts idiom, so a seeded display
 * replays identically here and the pacing test isn't at the mercy of a clock. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Run a timer for `seconds` at 60fps and collect every burst it hands back. */
function bursts(rand: () => number, seconds: number): FireworkBurst[] {
  const timer = makeFireworkTimer(rand)
  const out: FireworkBurst[] = []
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    const b = timer.tick(dt)
    if (b) out.push(b)
  }
  return out
}

describe('celebration() calendar', () => {
  it("fires on New Year's Eve and New Year's Day", () => {
    const eve = celebration(new Date(2026, 11, 31))
    const day = celebration(new Date(2027, 0, 1))
    expect(eve?.firework).toBe(true)
    expect(day?.firework).toBe(true)
    expect(day?.name).toBe('New Year')
  })

  it('fires on the other famously firework-lit nights', () => {
    expect(celebration(new Date(2026, 6, 4))?.firework).toBe(true) // Jul 4
    expect(celebration(new Date(2026, 10, 5))?.firework).toBe(true) // Nov 5
  })

  it('marks Halloween a celebration but launches no rockets', () => {
    const h = celebration(new Date(2026, 9, 31))
    expect(h?.name).toBe('Halloween')
    expect(h?.firework).toBe(false)
  })

  it('returns null on an ordinary day', () => {
    expect(celebration(new Date(2026, 2, 15))).toBeNull() // Mar 15
    expect(celebration(new Date(2026, 6, 3))).toBeNull() // Jul 3, the day before
  })

  it('ignores the year and time of day', () => {
    expect(celebration(new Date(1999, 0, 1, 23, 59))?.firework).toBe(true)
    expect(celebration(new Date(2050, 0, 1, 0, 0))?.firework).toBe(true)
  })
})

describe('makeFireworkTimer() pacing', () => {
  it('holds off on the first frames, then paces bursts out', () => {
    // GAP_MIN is 0.6s, so a third of a second in there is nothing yet.
    expect(bursts(makeRng(1), 0.3)).toHaveLength(0)
    // Over half a minute a display builds up, but nowhere near one per frame.
    const n = bursts(makeRng(1), 30).length
    expect(n).toBeGreaterThan(10)
    expect(n).toBeLessThan(60)
  })

  it('replays the same display for the same seed, burst for burst', () => {
    expect(bursts(makeRng(42), 20)).toEqual(bursts(makeRng(42), 20))
  })

  it('gives different seeds different displays', () => {
    expect(bursts(makeRng(1), 20)).not.toEqual(bursts(makeRng(2), 20))
  })

  it('throws bursts up over a ring around the car', () => {
    for (const b of bursts(makeRng(7), 20)) {
      const reach = Math.hypot(b.x, b.z)
      expect(reach).toBeGreaterThanOrEqual(40)
      expect(reach).toBeLessThanOrEqual(110)
      expect(b.y).toBeGreaterThanOrEqual(35)
      expect(b.y).toBeLessThanOrEqual(70)
    }
  })
})
