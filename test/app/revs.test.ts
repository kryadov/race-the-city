import { describe, it, expect } from 'vitest'
import { createRevs } from '../../src/app/revs'
import { VEHICLES } from '../../src/vehicle/vehicles'

// Run the model to steady state under a fixed input and read the settled rpm.
// The lag converges on the target, so this is the rpm the needle would rest at.
function settle(
  speedKmh: number,
  throttle: number,
  vehicle = VEHICLES.car,
  seconds = 5,
  dt = 1 / 60,
): number {
  const revs = createRevs()
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) revs.update(dt, speedKmh, throttle, vehicle)
  return revs.rpm()
}

describe('createRevs', () => {
  it('idles at rest — the engine is running, not spinning', () => {
    const rest = settle(0, 0)
    expect(rest).toBeGreaterThan(0) // ticking over, not dead at zero
    expect(rest).toBeLessThan(1200) // and down at the bottom of the dial, not up in the band
  })

  it('revs rise with throttle at a fixed speed', () => {
    const coasting = settle(40, 0)
    const onThePedal = settle(40, 1)
    expect(onThePedal).toBeGreaterThan(coasting)
  })

  it('revs rise with speed', () => {
    const crawling = settle(0, 0)
    const flatOut = settle(120, 0)
    expect(flatOut).toBeGreaterThan(crawling)
  })

  it('never jumps like a clock — the per-frame change is bounded', () => {
    const dt = 1 / 60
    const revs = createRevs()
    // Settle at idle first, so we are past the boot snap and measuring the lag.
    for (let i = 0; i < 300; i++) revs.update(dt, 0, 0, VEHICLES.car)
    // Now slam to full load and full throttle. The staircase would have dropped
    // the needle ~5600 rpm in a single frame at a gear line; this must not.
    let prev = revs.rpm()
    let maxStep = 0
    for (let i = 0; i < 300; i++) {
      revs.update(dt, 150, 1, VEHICLES.car) // 150 km/h > the car's top, so load pins high
      const now = revs.rpm()
      maxStep = Math.max(maxStep, Math.abs(now - prev))
      prev = now
    }
    expect(maxStep).toBeLessThan(800) // no clock-jump
    // Yet the revs still climbed a long way overall — small steps, big travel.
    expect(revs.rpm() - settle(0, 0)).toBeGreaterThan(3000)
  })

  it('gives different vehicle types visibly different revs', () => {
    // Same speed and throttle: the truck sits low and lazy, the sports car high.
    const truck = settle(60, 1, VEHICLES.truck)
    const sports = settle(60, 1, VEHICLES.sports)
    expect(sports).toBeGreaterThan(truck)
    expect(Math.abs(sports - truck)).toBeGreaterThan(400)
  })
})
