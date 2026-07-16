import { describe, it, expect } from 'vitest'
import { createCar, stepCar, GRAVITY, TAKEOFF_VY, type CarState } from '../../src/vehicle/car'
import { VEHICLES } from '../../src/vehicle/vehicles'
import { SpatialGrid } from '../../src/physics/grid'
import type { ElevationProvider } from '../../src/terrain/provider'

const grid = new SpatialGrid([], 25)
const coast = { throttle: 0, steer: 0, brake: false }
const car = VEHICLES.car
const DT = 1 / 60

/** A ramp climbing to x=50, then a sheer drop to flat ground. */
const jumpRamp: ElevationProvider = { heightAt: (x: number) => (x < 50 ? x * 0.2 : 0) }
const flat: ElevationProvider = { heightAt: () => 0 }

/** Drive east at `speed` until `stop(car)` says so, or we run out of frames. */
function drive(p: ElevationProvider, speed: number, stop: (c: CarState) => boolean, max = 2000): CarState {
  let c: CarState = { ...createCar(0, 0), vx: speed, y: p.heightAt(0, 0) }
  for (let i = 0; i < max; i++) {
    c = stepCar(c, coast, DT, grid, p, { ...car, dragForward: 0 })
    c.vx = speed // hold speed: this is about the vertical axis
    if (stop(c)) return c
  }
  return c
}

describe('jumps', () => {
  it('leaves the ground at the crest, carrying speed', () => {
    const airborne = drive(jumpRamp, 30, (c) => c.x > 52 && c.y > 0.2)
    expect(airborne.x, 'should still be flying just past the lip').toBeGreaterThan(50)
    expect(airborne.y, 'and be off the ground').toBeGreaterThan(0.2)
    expect(airborne.vy, 'thrown upward by the ramp').toBeGreaterThan(0)
  })

  it('lands again rather than flying off forever', () => {
    const landed = drive(jumpRamp, 30, (c) => c.x > 60 && c.y <= 0.001 && c.vy === 0)
    expect(landed.y).toBeCloseTo(0)
    expect(landed.vy).toBe(0)
  })

  it('flies further the faster you hit it', () => {
    const far = (speed: number): number => {
      let c: CarState = { ...createCar(0, 0), vx: speed, y: 0 }
      for (let i = 0; i < 2000; i++) {
        c = stepCar(c, coast, DT, grid, jumpRamp, { ...car, dragForward: 0 })
        c.vx = speed
        if (c.x > 51 && c.y <= 0.001) return c.x // landed
      }
      return c.x
    }
    expect(far(35)).toBeGreaterThan(far(15))
  })

  it('does not launch off a gentle crest at a crawl', () => {
    // a car pottering over a hump should stay glued to the road
    const gentle: ElevationProvider = { heightAt: (x: number) => (x < 50 ? x * 0.01 : 0.5 - (x - 50) * 0.01) }
    let c: CarState = { ...createCar(0, 0), vx: 3, y: 0 }
    let maxAir = 0
    for (let i = 0; i < 1500; i++) {
      c = stepCar(c, coast, DT, grid, gentle, { ...car, dragForward: 0 })
      c.vx = 3
      maxAir = Math.max(maxAir, c.y - gentle.heightAt(c.x, c.z))
    }
    expect(maxAir).toBeLessThan(0.1)
  })

  it('keeps a parked car on the ground', () => {
    let c = { ...createCar(0, 0), y: 0 }
    for (let i = 0; i < 300; i++) c = stepCar(c, coast, DT, grid, flat, car)
    expect(c.y).toBeCloseTo(0)
    expect(c.vy).toBeCloseTo(0)
  })

  it('drops a car left in mid-air onto the ground', () => {
    let c: CarState = { ...createCar(0, 0), y: 20 }
    for (let i = 0; i < 300; i++) c = stepCar(c, coast, DT, grid, flat, car)
    expect(c.y).toBeCloseTo(0)
  })

  it('accelerates downward at gravity while flying', () => {
    let c: CarState = { ...createCar(0, 0), y: 100, vy: 0 }
    c = stepCar(c, coast, DT, grid, flat, car)
    expect(c.vy).toBeCloseTo(-GRAVITY * DT, 4)
  })

  it('never throws a hovercar, whatever it drives over', () => {
    // it floats; a crest has nothing to throw
    let c: CarState = { ...createCar(0, 0), vx: 40, y: 0 }
    for (let i = 0; i < 600; i++) {
      c = stepCar(c, coast, DT, grid, jumpRamp, { ...VEHICLES.hover, dragForward: 0 })
      c.vx = 40
      expect(c.vy).toBe(0)
    }
  })

  it('exposes a takeoff threshold above a standstill', () => {
    expect(TAKEOFF_VY).toBeGreaterThan(0)
  })
})

describe('smooth crests do not throw the car', () => {
  /** A bridge arch: 5m over a 100m span, which is what deckHeights builds. */
  const arch: ElevationProvider = {
    heightAt: (x: number) => (x > 0 && x < 100 ? Math.sin((Math.PI * x) / 100) * 5 : 0),
  }

  it('holds the car on a bridge arch at speed', () => {
    // The old rule — "was climbing, now isn't" — fired at the crest of every
    // arch: at 25m/s the arch is worth ~3m/s of climb, over the threshold. The
    // car took off, landed and took off again, and that was the shake.
    let c: CarState = { ...createCar(0, 0), vx: 25, y: 0 }
    let worst = 0
    for (let i = 0; i < 400; i++) {
      c = stepCar(c, coast, DT, grid, arch, { ...car, dragForward: 0 })
      c.vx = 25
      worst = Math.max(worst, c.y - arch.heightAt(c.x, c.z))
    }
    expect(worst, 'the car left the deck').toBeLessThan(0.05)
  })

  it('still throws it off a sharp lip at the same speed', () => {
    // the difference is the surface falling away faster than gravity holds you
    let c: CarState = { ...createCar(0, 0), vx: 25, y: 0 }
    let air = 0
    for (let i = 0; i < 400; i++) {
      c = stepCar(c, coast, DT, grid, jumpRamp, { ...car, dragForward: 0 })
      c.vx = 25
      air = Math.max(air, c.y - jumpRamp.heightAt(c.x, c.z))
    }
    expect(air, 'a real ramp should still launch it').toBeGreaterThan(0.5)
  })
})
