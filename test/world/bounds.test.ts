import { describe, it, expect } from 'vitest'
import { circleBounds, rectBounds, confineToBounds } from '../../src/world/bounds'

/** Integrate a car through the barrier for `frames` at 60fps, mutating in place. */
function drive(car: { x: number; z: number; vx: number; vz: number }, bounds: Parameters<typeof confineToBounds>[1], frames: number): void {
  const dt = 1 / 60
  for (let i = 0; i < frames; i++) {
    car.x += car.vx * dt
    car.z += car.vz * dt
    confineToBounds(car, bounds, dt)
  }
}

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

describe('rectBounds — the square the game actually uses', () => {
  const b = () => rectBounds(965, 990)

  it('is a no-op well inside the square, even out near a corner', () => {
    const car = { x: 700, z: 700, vx: 12, vz: -8 }
    confineToBounds(car, b(), 0.1)
    expect(car).toEqual({ x: 700, z: 700, vx: 12, vz: -8 })
  })

  it('confines along the axis a point most exceeds', () => {
    const p = b().probe(994, 200) // x is the exceeded axis
    expect(p.soft).toBeCloseTo(29) // 994 − 965
    expect(p.nx).toBe(1)
    expect(p.nz).toBe(0)
  })

  it('cannot be driven across the edge, flooring it over hundreds of frames', () => {
    const car = { x: 900, z: 0, vx: 40, vz: 0 }
    drive(car, b(), 300)
    expect(Math.abs(car.x)).toBeLessThanOrEqual(990 + 1e-6) // never punches through
  })

  it('lets you graze along the edge without grinding to a halt', () => {
    // pinned to the +x edge, driving purely along it (the vr=0 path)
    const car = { x: 990, z: 0, vx: 0, vz: 12 }
    drive(car, b(), 300)
    expect(car.vz).toBeCloseTo(12) // tangential speed survives; no per-frame leak
    expect(Math.abs(car.x)).toBeLessThanOrEqual(990 + 1e-6)
  })

  it('holds a car driving hard into a diagonal corner near the edge', () => {
    const car = { x: 900, z: 900, vx: 30, vz: 30 }
    drive(car, b(), 300)
    // per-axis confinement can let one axis sit a single frame's travel past the
    // backstop before the next dominance flip, but never escapes toward the void
    expect(Math.abs(car.x)).toBeLessThanOrEqual(992)
    expect(Math.abs(car.z)).toBeLessThanOrEqual(992)
  })
})
