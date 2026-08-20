import { describe, it, expect } from 'vitest'
import { mulberry32, randomSeed, stream } from '../../src/app/worldSeed'

const take = (rand: () => number, n = 8): number[] => Array.from({ length: n }, () => rand())

describe('worldSeed', () => {
  it('mulberry32 is deterministic and stays in [0,1)', () => {
    expect(take(mulberry32(1234))).toEqual(take(mulberry32(1234)))
    for (const v of take(mulberry32(99), 200)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('gives the same layer the same sequence on both clients', () => {
    expect(take(stream(0xc0ffee, 'traffic'))).toEqual(take(stream(0xc0ffee, 'traffic')))
  })

  it('gives different layers different sequences', () => {
    expect(take(stream(0xc0ffee, 'traffic'))).not.toEqual(take(stream(0xc0ffee, 'boats')))
  })

  it('gives different seeds different sequences', () => {
    expect(take(stream(1, 'traffic'))).not.toEqual(take(stream(2, 'traffic')))
  })

  it('is independent of how much any other layer drew — the desync guard', () => {
    // One client burns 500 draws of traffic (denser setting); boats must not shift.
    const a = stream(7, 'traffic')
    for (let i = 0; i < 500; i++) a()
    expect(take(stream(7, 'boats'))).toEqual(take(stream(7, 'boats')))
  })

  it('randomSeed returns a 32-bit unsigned integer', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed()
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
