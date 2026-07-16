import { describe, it, expect } from 'vitest'
import { groundStats } from '../../src/world/buildings'
import type { Vec2 } from '../../src/geo/types'

describe('groundStats', () => {
  it('computes average and minimum ground under a footprint', () => {
    const ramp = { heightAt: (x: number) => x } // height rises with x
    const ring: Vec2[] = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ]
    const s = groundStats(ring, ramp)
    expect(s.min).toBe(0) // lowest corner (x=0)
    expect(s.avg).toBe(5) // (0 + 10 + 10 + 0) / 4
  })
})
