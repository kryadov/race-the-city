import { describe, it, expect } from 'vitest'
import { resolveAgainstCircles, bounce } from '../../src/physics/collide'

describe('resolveAgainstCircles', () => {
  it('leaves a clear path alone', () => {
    const r = resolveAgainstCircles(0, 0, 1.3, [{ x: 50, z: 0, r: 2 }])
    expect(r.hit).toBe(false)
    expect(r.x).toBe(0)
    expect(r.z).toBe(0)
  })

  it('pushes the car clear of what it hit', () => {
    // car at 2, person at 0: they overlap, so the car must end up 1.3+0.4 away
    const r = resolveAgainstCircles(1, 0, 1.3, [{ x: 0, z: 0, r: 0.4 }])
    expect(r.hit).toBe(true)
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1.7)
  })

  it('reports a normal pointing away from the obstacle', () => {
    const r = resolveAgainstCircles(1, 0, 1.3, [{ x: 0, z: 0, r: 0.4 }])
    expect(r.nx).toBeCloseTo(1)
    expect(r.nz).toBeCloseTo(0)
  })

  it('picks a way out even from dead centre, rather than dividing by zero', () => {
    const r = resolveAgainstCircles(0, 0, 1.3, [{ x: 0, z: 0, r: 0.4 }])
    expect(r.hit).toBe(true)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.z)).toBe(true)
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1.7)
  })

  it('frees the car from several at once', () => {
    const r = resolveAgainstCircles(0, 0, 1.3, [
      { x: 0.5, z: 0, r: 0.4 },
      { x: -0.5, z: 0.2, r: 0.4 },
    ])
    expect(r.hit).toBe(true)
    expect(Number.isFinite(r.x)).toBe(true)
  })
})

describe('bounce', () => {
  it('reverses the part heading into the surface', () => {
    // driving +x into a wall whose normal is -x... i.e. normal points back at us
    const b = bounce(10, 0, -1, 0, 0.5)
    expect(b.vx).toBeLessThan(0) // sent back
    expect(Math.abs(b.vx)).toBeCloseTo(5) // at half the speed
  })

  it('keeps the part sliding along it', () => {
    const b = bounce(10, 4, -1, 0, 0)
    expect(b.vz, 'a glancing blow should slide, not stop dead').toBeCloseTo(4)
    expect(b.vx).toBeCloseTo(0)
  })

  it('leaves a car already driving away alone', () => {
    // no restitution kick when you're leaving: that would fling you back in
    const b = bounce(10, 0, 1, 0, 0.5)
    expect(b.vx).toBeCloseTo(10)
    expect(b.vz).toBeCloseTo(0)
  })

  it('with no restitution, kills the approach and nothing else', () => {
    const b = bounce(10, 0, -1, 0, 0)
    expect(b.vx).toBeCloseTo(0)
  })

  it('never adds speed out of nowhere — no carmageddon launches', () => {
    for (const rest of [0, 0.3, 0.5]) {
      const b = bounce(12, 5, -1, 0, rest)
      expect(Math.hypot(b.vx, b.vz)).toBeLessThanOrEqual(Math.hypot(12, 5) + 1e-9)
    }
  })
})
