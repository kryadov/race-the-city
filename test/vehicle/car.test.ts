import { describe, it, expect } from 'vitest'
import { createCar, stepCar } from '../../src/vehicle/car'
import { SpatialGrid } from '../../src/physics/grid'
import { FlatProvider } from '../../src/terrain/flat'
import type { Vec2 } from '../../src/geo/types'

const emptyGrid = new SpatialGrid([], 25)
const flat = new FlatProvider()
const NO_INPUT = { throttle: 0, steer: 0, brake: false }

describe('stepCar', () => {
  it('accelerates forward under throttle', () => {
    let car = createCar()
    car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.5, emptyGrid, flat)
    expect(car.speed).toBeGreaterThan(0)
  })

  it('coasts to a stop from friction', () => {
    let car = createCar()
    car.speed = 10
    for (let i = 0; i < 200; i++) car = stepCar(car, NO_INPUT, 0.1, emptyGrid, flat)
    expect(Math.abs(car.speed)).toBeLessThan(0.5)
  })

  it('turns heading while moving', () => {
    let car = createCar()
    car.speed = 5
    const before = car.heading
    car = stepCar(car, { throttle: 0, steer: 1, brake: false }, 0.5, emptyGrid, flat)
    expect(car.heading).not.toBeCloseTo(before)
  })

  it('does not turn while stopped', () => {
    let car = createCar()
    const before = car.heading
    car = stepCar(car, { throttle: 0, steer: 1, brake: false }, 0.5, emptyGrid, flat)
    expect(car.heading).toBeCloseTo(before)
  })

  it('is blocked from driving into a building', () => {
    const box: Vec2[] = [{ x: 5, z: -5 }, { x: 15, z: -5 }, { x: 15, z: 5 }, { x: 5, z: 5 }]
    const grid = new SpatialGrid([box], 25)
    let car = createCar(0, 0)
    car.heading = 0 // faces +x (see convention in impl)
    car.speed = 30
    for (let i = 0; i < 30; i++) car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.1, grid, flat)
    expect(car.x).toBeLessThan(5) // never penetrates the near wall
  })

  it('follows terrain height in Y', () => {
    const ramp = { heightAt: (x: number) => x } // y = x
    let car = createCar(0, 0)
    car.speed = 10
    car.heading = 0
    car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.5, emptyGrid, ramp)
    expect(car.y).toBeGreaterThan(0)
    expect(car.y).toBeCloseTo(car.x, 5)
  })
})
