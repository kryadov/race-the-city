import { describe, it, expect } from 'vitest'
import { burn, speedFactor, TANK, LOW, DRY_PENALTY, CAN_WORTH } from '../../src/vehicle/fuel'

describe('burn', () => {
  it('empties a full tank in TANK seconds of full throttle', () => {
    let fuel = 1
    for (let i = 0; i < TANK * 60; i++) fuel = burn(fuel, 1, 1 / 60)
    expect(fuel).toBeCloseTo(0, 5)
  })

  it('costs nothing while you are not on the throttle', () => {
    expect(burn(0.5, 0, 10)).toBe(0.5)
  })

  it('burns on the way back too — reverse is not free', () => {
    expect(burn(0.5, -1, 1)).toBeLessThan(0.5)
  })

  it('never goes below empty, however long you sit on it', () => {
    expect(burn(0.01, 1, 9999)).toBe(0)
  })
})

describe('speedFactor', () => {
  it('leaves a car with fuel in it entirely alone', () => {
    // A gauge that slows you at half a tank has you hunting cans, not driving.
    expect(speedFactor(1)).toBe(1)
    expect(speedFactor(0.5)).toBe(1)
    expect(speedFactor(LOW)).toBe(1)
  })

  it('takes the edge off as the tank runs down', () => {
    expect(speedFactor(LOW / 2)).toBeLessThan(1)
    expect(speedFactor(LOW / 2)).toBeGreaterThan(speedFactor(0))
  })

  it('slows a dry car rather than stopping it', () => {
    // Being unable to move in a driving game is the end of the session.
    expect(speedFactor(0)).toBeCloseTo(1 - DRY_PENALTY, 5)
    expect(speedFactor(0)).toBeGreaterThan(0.3)
  })

  it('has no cliff at the warning mark', () => {
    expect(speedFactor(LOW - 0.001)).toBeCloseTo(1, 2)
  })

  it('is not thrown by a tank that is somehow overfull or negative', () => {
    expect(speedFactor(2)).toBe(1)
    expect(speedFactor(-1)).toBeCloseTo(1 - DRY_PENALTY, 5)
  })
})

describe('a can of petrol', () => {
  it('is worth a useful part of a tank, but not a tank', () => {
    expect(CAN_WORTH).toBeGreaterThan(0.1)
    expect(CAN_WORTH).toBeLessThan(1)
  })

  it('takes about three of them to fill an empty car', () => {
    expect(Math.min(1, CAN_WORTH * 3)).toBeGreaterThan(0.9)
  })
})
