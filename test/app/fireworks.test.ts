import { describe, it, expect } from 'vitest'
import { sparkAt } from '../../src/app/fireworks'

describe('sparkAt', () => {
  const origin = { x: 10, y: 50, z: -4 }

  it('is at the burst the instant it goes off', () => {
    expect(sparkAt(0, { x: 8, y: 12, z: 0 }, origin)).toEqual(origin)
  })

  it('flies out along its velocity', () => {
    const p = sparkAt(0.5, { x: 8, y: 0, z: 0 }, origin)
    expect(p.x).toBeCloseTo(14, 5)
    expect(p.z).toBeCloseTo(-4, 5)
  })

  it('falls: a spark thrown up is on its way down by the end', () => {
    const up = { x: 0, y: 12, z: 0 }
    const rising = sparkAt(0.4, up, origin).y
    const late = sparkAt(2.4, up, origin).y
    expect(rising).toBeGreaterThan(origin.y)
    expect(late).toBeLessThan(rising)
  })
})
