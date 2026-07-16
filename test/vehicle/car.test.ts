import { describe, it, expect } from 'vitest'
import { createCar, stepCar, type CarState } from '../../src/vehicle/car'
import { VEHICLES, HOVER_H, type VehicleSpec } from '../../src/vehicle/vehicles'
import { SpatialGrid } from '../../src/physics/grid'
import { FlatProvider } from '../../src/terrain/flat'
import type { Vec2 } from '../../src/geo/types'

const emptyGrid = new SpatialGrid([], 25)
const flat = new FlatProvider()
const NO_INPUT = { throttle: 0, steer: 0, brake: false }
const car = VEHICLES.car

/** Forward/lateral speed relative to the car's heading. */
function components(c: CarState): { forward: number; lateral: number } {
  const forward = c.vx * Math.cos(c.heading) + c.vz * Math.sin(c.heading)
  const lateral = c.vx * -Math.sin(c.heading) + c.vz * Math.cos(c.heading)
  return { forward, lateral }
}

describe('stepCar (arcade drift)', () => {
  it('accelerates forward under throttle', () => {
    let c = createCar()
    c = stepCar(c, { throttle: 1, steer: 0, brake: false }, 0.3, emptyGrid, flat, car)
    expect(components(c).forward).toBeGreaterThan(0)
    expect(c.x).toBeGreaterThan(0) // heading 0 → +x
  })

  it('coasts to a stop from drag', () => {
    let c = createCar()
    c.vx = 15
    for (let i = 0; i < 200; i++) c = stepCar(c, NO_INPUT, 0.1, emptyGrid, flat, car)
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(0.5)
  })

  it('turns heading while moving but not while parked', () => {
    let moving = createCar()
    moving.vx = 10
    const h0 = moving.heading
    moving = stepCar(moving, { throttle: 0, steer: 1, brake: false }, 0.3, emptyGrid, flat, car)
    expect(moving.heading).not.toBeCloseTo(h0)

    let parked = createCar()
    const p0 = parked.heading
    parked = stepCar(parked, { throttle: 0, steer: 1, brake: false }, 0.3, emptyGrid, flat, car)
    expect(parked.heading).toBeCloseTo(p0)
  })

  it('drifts more with lower lateral grip (all else equal)', () => {
    const slippery: VehicleSpec = { ...car, gripLateral: 2 }
    const grippy: VehicleSpec = { ...car, gripLateral: 12 }
    const start = (): CarState => ({ x: 0, z: 0, y: 0, heading: 0, vx: 20, vz: 0, vy: 0 })
    const hardTurn = { throttle: 0, steer: 1, brake: false }
    const a = stepCar(start(), hardTurn, 0.2, emptyGrid, flat, slippery)
    const b = stepCar(start(), hardTurn, 0.2, emptyGrid, flat, grippy)
    expect(Math.abs(components(a).lateral)).toBeGreaterThan(Math.abs(components(b).lateral))
  })

  it('brake does not overshoot a slow car into reverse', () => {
    let c = createCar()
    c.vx = 1
    c = stepCar(c, { throttle: 0, steer: 0, brake: true }, 1.0, emptyGrid, flat, car)
    expect(components(c).forward).toBeGreaterThanOrEqual(0)
  })

  it('cannot drive through a building', () => {
    const box: Vec2[] = [{ x: 6, z: -6 }, { x: 16, z: -6 }, { x: 16, z: 6 }, { x: 6, z: 6 }]
    const grid = new SpatialGrid([box], 25)
    let c = createCar(0, 0)
    for (let i = 0; i < 40; i++) {
      c = stepCar(c, { throttle: 1, steer: 0, brake: false }, 0.1, grid, flat, VEHICLES.sports)
    }
    expect(c.x).toBeLessThan(6)
  })

  it('follows terrain height in Y', () => {
    const ramp = { heightAt: (x: number) => x }
    let c = createCar(0, 0)
    c.vx = 8
    c = stepCar(c, { throttle: 1, steer: 0, brake: false }, 0.3, emptyGrid, ramp, car)
    expect(c.y).toBeGreaterThan(0)
    expect(c.y).toBeCloseTo(c.x, 5)
  })

  it('floats the hovercar above the terrain and plants a normal car on it', () => {
    const ground = { heightAt: () => 12 }

    const floated = stepCar(createCar(), NO_INPUT, 0.016, emptyGrid, ground, VEHICLES.hover)
    expect(floated.y).toBeCloseTo(12 + HOVER_H)

    const planted = stepCar(createCar(), NO_INPUT, 0.016, emptyGrid, ground, VEHICLES.car)
    expect(planted.y).toBeCloseTo(12)
  })
})

describe('VEHICLES presets', () => {
  it('orders top speed sports > car > truck', () => {
    expect(VEHICLES.sports.maxSpeed).toBeGreaterThan(VEHICLES.car.maxSpeed)
    expect(VEHICLES.car.maxSpeed).toBeGreaterThan(VEHICLES.truck.maxSpeed)
  })
  it('makes the truck heavier: slower accel, less grip, bigger radius', () => {
    expect(VEHICLES.truck.accel).toBeLessThan(VEHICLES.car.accel)
    expect(VEHICLES.truck.gripLateral).toBeLessThan(VEHICLES.car.gripLateral)
    expect(VEHICLES.truck.radius).toBeGreaterThan(VEHICLES.car.radius)
  })
  it('makes the sports car the quickest to accelerate', () => {
    expect(VEHICLES.sports.accel).toBeGreaterThan(VEHICLES.car.accel)
  })
})

describe('braking', () => {
  it('stops at a standstill and never reverses through it', () => {
    // an unclamped Euler step overshoots at low speed and drives you backwards
    const brake = { throttle: 0, steer: 0, brake: true }
    for (const speed of [0.05, 0.3, 1, 4, 12]) {
      for (const dt of [1 / 60, 1 / 20, 0.05]) {
        const c = stepCar({ ...createCar(), vx: speed, vy: 0 }, brake, dt, emptyGrid, flat, car)
        const fwd = c.vx * Math.cos(c.heading) + c.vz * Math.sin(c.heading)
        expect(fwd, `${speed}m/s over ${dt}s`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('stops a reversing car at a standstill too', () => {
    const brake = { throttle: 0, steer: 0, brake: true }
    const c = stepCar({ ...createCar(), vx: -0.4, vy: 0 }, brake, 0.05, emptyGrid, flat, car)
    const fwd = c.vx * Math.cos(c.heading) + c.vz * Math.sin(c.heading)
    expect(fwd).toBeLessThanOrEqual(0)
    expect(fwd).toBeGreaterThan(-0.4) // slowed, not flung forwards
  })
})
