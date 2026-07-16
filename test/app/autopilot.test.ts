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

describe('autopilot avoidance', () => {
  const straight: Road[] = [{ points: [v(0, 0), v(600, 0), v(1200, 0)], kind: 'primary' }]

  /** Set the car rolling east down the straight. */
  const rolling = (): CarState => ({ ...createCar(0, 0), vx: 22, vy: 0 })

  it('brakes for something stopped in its path', () => {
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    const train = [{ x: 20, z: 0, r: 2.4 }] // dead ahead, close
    expect(a.drive(rolling(), spec.maxSpeed, train).brake).toBe(true)
  })

  it('steers away from it rather than straight through', () => {
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    // sitting slightly right of us: we should go left
    const car = [{ x: 18, z: 1.2, r: 2 }]
    expect(a.drive(rolling(), spec.maxSpeed, car).steer).toBeLessThan(0)
  })

  it('swerves the other way for something on the other side', () => {
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    const car = [{ x: 18, z: -1.2, r: 2 }]
    expect(a.drive(rolling(), spec.maxSpeed, car).steer).toBeGreaterThan(0)
  })

  it('ignores what is behind it', () => {
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    const behind = [{ x: -20, z: 0, r: 2.4 }]
    expect(a.drive(rolling(), spec.maxSpeed, behind).brake).toBe(false)
  })

  it('ignores what it will comfortably pass', () => {
    // braking for everything within a radius means never getting anywhere
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    const wide = [{ x: 20, z: 14, r: 2 }]
    expect(a.drive(rolling(), spec.maxSpeed, wide).brake).toBe(false)
  })

  it('drives on as before when the road is clear', () => {
    const a = createAutopilot()
    a.reset(straight, createCar(0, 0))
    const clear = a.drive(rolling(), spec.maxSpeed, [])
    const none = a.drive(rolling(), spec.maxSpeed)
    expect(clear.brake).toBe(none.brake)
  })

  it('does not drive through a train parked across the road', () => {
    const a = createAutopilot()
    let car: CarState = createCar(0, 0)
    a.reset(straight, car)
    // a train sitting across the straight at x=300
    const train = Array.from({ length: 9 }, (_, i) => ({ x: 300, z: (i - 4) * 2.2, r: 2.4 }))
    let closest = Infinity
    for (let i = 0; i < 4000; i++) {
      car = stepCar(car, a.drive(car, spec.maxSpeed, train), 1 / 60, grid, flat, spec)
      if (car.x > 260 && car.x < 340) closest = Math.min(closest, Math.abs(car.x - 300))
    }
    // it should never simply barrel through where the train stands
    expect(closest, 'the demo drove into the train').toBeGreaterThan(2)
  })
})

describe('handing the wheel back', () => {
  const grid2: Road[] = [
    { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
    { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
  ]

  it('picks the route up from where the car actually is', () => {
    // Drive off on your own and the demo's old target is somewhere behind you,
    // usually through a building. Steering at it is the bug.
    const a = createAutopilot()
    a.reset(grid2, createCar(0, 0))

    const strayed: CarState = { ...createCar(300, 300), vx: 5, vy: 0 }
    a.rehome(strayed)
    const i = a.drive(strayed, spec.maxSpeed)
    expect(Math.abs(i.steer)).toBeLessThanOrEqual(1)
    expect(Number.isFinite(i.steer)).toBe(true)
  })

  it('heads for road it can reach, not back across country', () => {
    const a = createAutopilot()
    a.reset(grid2, createCar(0, 0))
    // stand the car near the north arm, facing north
    let car: CarState = { ...createCar(0, 300), vx: 0, vy: 0, heading: Math.PI / 2 }
    a.rehome(car)
    for (let i = 0; i < 1800; i++) car = stepCar(car, a.drive(car, spec.maxSpeed), 1 / 60, grid, flat, spec)
    // it should still be on the road network, not out in the fields
    const onArm = Math.abs(car.x) < 40 || Math.abs(car.z) < 40
    expect(onArm, 'the demo wandered off the roads').toBe(true)
  })

  it('rehome does not need the roads again', () => {
    // it keeps the graph: cheap enough to call every frame the player steers
    const a = createAutopilot()
    a.reset(grid2, createCar(0, 0))
    expect(() => {
      for (let i = 0; i < 500; i++) a.rehome(createCar(i, 0))
    }).not.toThrow()
  })
})
