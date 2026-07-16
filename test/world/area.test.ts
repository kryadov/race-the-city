import { describe, it, expect } from 'vitest'
import { ringArea, inradius } from '../../src/world/area'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const square = (s: number): Vec2[] => [v(0, 0), v(s, 0), v(s, s), v(0, s)]

describe('ringArea', () => {
  it('measures a square', () => {
    expect(Math.abs(ringArea(square(10)))).toBeCloseTo(100)
    expect(Math.abs(ringArea(square(40)))).toBeCloseTo(1600)
  })

  it('gives the same size whichever way the ring is wound', () => {
    const cw = square(10)
    const ccw = [...cw].reverse()
    expect(Math.abs(ringArea(cw))).toBeCloseTo(Math.abs(ringArea(ccw)))
  })
})

describe('inradius', () => {
  it('finds the room in a square', () => {
    // it samples a grid, so it lands near the middle rather than exactly on it
    const fit = inradius(square(100))
    expect(fit.r).toBeGreaterThan(40) // half of 100, near enough
    expect(fit.r).toBeLessThanOrEqual(50)
    expect(Math.abs(fit.x - 50)).toBeLessThan(5)
    expect(Math.abs(fit.z - 50)).toBeLessThan(5)
  })

  it('is not fooled by area on a long thin strip', () => {
    // The whole point: this canal has 20,000m² and 20m of width. Area alone
    // would sail a ship up it.
    const canal: Vec2[] = [v(0, 0), v(1000, 0), v(1000, 20), v(0, 20)]
    expect(Math.abs(ringArea(canal))).toBe(20000)
    expect(inradius(canal).r, 'a ship needs room, not acreage').toBeLessThan(12)
  })

  it('puts the point it finds inside the shape', () => {
    const L: Vec2[] = [v(0, 0), v(100, 0), v(100, 30), v(30, 30), v(30, 100), v(0, 100)]
    const fit = inradius(L)
    expect(fit.r).toBeGreaterThan(5)
    // the notch at (60,60) is outside the L; the fit must not land there
    expect(fit.x < 30 || fit.z < 30).toBe(true)
  })

  it('reports next to no room in a sliver', () => {
    expect(inradius([v(0, 0), v(50, 0), v(50, 1), v(0, 1)]).r).toBeLessThan(1)
  })
})

describe('circleFits', () => {
  it('accepts a boat that stays in the water', async () => {
    const { circleFits } = await import('../../src/app/boats')
    const lake = square(200)
    // a small boat circling the middle of a big lake
    expect(circleFits(lake, 100, 100, 40, 3)).toBe(true)
  })

  it('rejects one whose hull would swing onto the bank', () => {
    // this is the check that matters: the centre is in the water and the ends
    // are not, which is a ship in a field
    return import('../../src/app/boats').then(({ circleFits }) => {
      const pond = square(60)
      expect(circleFits(pond, 30, 30, 25, 19)).toBe(false)
    })
  })

  it('rejects a circle whose centre is outside the shape entirely', () => {
    return import('../../src/app/boats').then(({ circleFits }) => {
      expect(circleFits(square(50), 500, 500, 5, 2)).toBe(false)
    })
  })
})
