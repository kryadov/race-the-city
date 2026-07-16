import { describe, it, expect } from 'vitest'
import { createAutopilot } from '../../src/app/autopilot'
import { createCar, stepCar, type CarState } from '../../src/vehicle/car'
import { VEHICLES } from '../../src/vehicle/vehicles'
import { SpatialGrid } from '../../src/physics/grid'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const grid = new SpatialGrid([], 25)
const flat = { heightAt: () => 0 }
const spec = VEHICLES.car

/** A ring road, so there is always somewhere to go. */
const ring: Road[] = [
  { points: [v(0, 0), v(200, 0), v(200, 200), v(0, 200), v(0, 0)], kind: 'residential' },
]

describe('autopilot', () => {
  it('stays off until switched on', () => {
    const a = createAutopilot()
    expect(a.enabled()).toBe(false)
    a.setEnabled(true)
    expect(a.enabled()).toBe(true)
  })

  it('says nothing before it has any roads', () => {
    const a = createAutopilot()
    const i = a.drive(createCar(), 40)
    expect(i).toEqual({ throttle: 0, steer: 0, brake: false })
  })

  it('drives the car somewhere', () => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(ring, car)
    for (let i = 0; i < 600; i++) car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
    expect(Math.hypot(car.x, car.z), 'should have gone somewhere').toBeGreaterThan(30)
  })

  it('keeps to the road rather than wandering off across country', () => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(ring, car)
    let worst = 0
    for (let i = 0; i < 3000; i++) {
      car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
      // distance from the ring: outside [0,200] on both axes means it left
      const dx = Math.max(0, Math.max(-car.x, car.x - 200))
      const dz = Math.max(0, Math.max(-car.z, car.z - 200))
      worst = Math.max(worst, Math.hypot(dx, dz))
    }
    expect(worst, 'strayed from the ring').toBeLessThan(40)
  })

  it('keeps moving over a long run rather than parking at a junction', () => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(ring, car)
    for (let i = 0; i < 2000; i++) car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
    const before = { x: car.x, z: car.z }
    for (let i = 0; i < 600; i++) car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
    expect(Math.hypot(car.x - before.x, car.z - before.z), 'stalled').toBeGreaterThan(10)
  })

  it('holds a sensible speed instead of flooring it everywhere', () => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(ring, car)
    let top = 0
    for (let i = 0; i < 2000; i++) {
      car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
      top = Math.max(top, Math.hypot(car.vx, car.vz))
    }
    expect(top).toBeGreaterThan(3) // it does drive
    expect(top).toBeLessThan(spec.maxSpeed) // but it isn't a lunatic
  })
})

describe('autopilot on nitro', () => {
  const straight: Road[] = [{ points: [v(0, 0), v(3000, 0)], kind: 'primary' }]

  /** Drive down a straight for a while and report the top speed reached. */
  const topSpeed = (maxSpeed: number): number => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(straight, car)
    let top = 0
    for (let i = 0; i < 3000; i++) {
      car = stepCar(car, a.drive(car, maxSpeed), 1 / 60, grid, flat, { ...spec, maxSpeed })
      top = Math.max(top, Math.hypot(car.vx, car.vz))
    }
    return top
  }

  it('uses the boost instead of cruising straight past it', () => {
    // the bug: it was handed the base spec, so a tenfold top speed changed nothing
    const normal = topSpeed(spec.maxSpeed)
    const boosted = topSpeed(spec.maxSpeed * 10)
    expect(boosted).toBeGreaterThan(normal * 1.5)
  })

  it('still keeps the speed driveable, boost or no', () => {
    // 10x top speed is 420m/s; taking a city street at that is just a crash
    expect(topSpeed(spec.maxSpeed * 10)).toBeLessThan(60)
  })
})
