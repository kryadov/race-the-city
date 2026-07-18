import { describe, it, expect } from 'vitest'
import { circleBounds, confineToBounds } from '../../src/world/bounds'

describe('circleBounds.probe', () => {
  it('reads a point past the soft edge as over, normal pointing out', () => {
    const b = circleBounds(900, 950)
    const p = b.probe(920, 0)
    expect(p.soft).toBeCloseTo(20) // 920 − 900
    expect(p.hard).toBeCloseTo(-30) // 920 − 950 (still inside the hard edge)
    expect(p.nx).toBeCloseTo(1)
    expect(p.nz).toBeCloseTo(0)
  })

  it('reads a point well inside as negative distances', () => {
    const b = circleBounds(900, 950)
    const p = b.probe(0, 100)
    expect(p.soft).toBeLessThan(0)
    expect(p.hard).toBeLessThan(0)
    expect(p.nz).toBeCloseTo(1) // normal points along +z, away from the origin
  })
})

describe('confineToBounds', () => {
  it('does nothing to a car inside the soft edge', () => {
    const b = circleBounds(900, 950)
    const car = { x: 100, z: 0, vx: 10, vz: 0 }
    confineToBounds(car, b, 0.1)
    expect(car).toEqual({ x: 100, z: 0, vx: 10, vz: 0 })
  })

  it('bleeds outward speed but keeps speed along the edge', () => {
    const b = circleBounds(900, 950)
    // just past the soft edge on +x, moving out-and-along
    const car = { x: 910, z: 0, vx: 10, vz: 10 }
    confineToBounds(car, b, 0.1)
    expect(car.vx).toBeLessThan(10) // the outward (x) component is braked
    expect(car.vx).toBeGreaterThan(0) // but softly — not a wall
    expect(car.vz).toBeCloseTo(10) // the tangential (z) component is untouched
  })

  it('never brakes a car heading back inward', () => {
    const b = circleBounds(900, 950)
    const car = { x: 930, z: 0, vx: -15, vz: 0 }
    confineToBounds(car, b, 0.1)
    expect(car.vx).toBeCloseTo(-15)
  })

  it('clamps position at the hard backstop and kills the outward speed', () => {
    const b = circleBounds(900, 950)
    const car = { x: 980, z: 0, vx: 20, vz: 5 }
    confineToBounds(car, b, 0.1)
    expect(Math.hypot(car.x, car.z)).toBeLessThanOrEqual(950 + 1e-6)
    expect(car.vx).toBeLessThanOrEqual(1e-6) // no outward velocity remains
    expect(car.vz).toBeCloseTo(5) // tangential motion survives the clamp
  })
})
