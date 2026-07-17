import { describe, it, expect } from 'vitest'
import { VEHICLE_TYPES, VEHICLE_GROUPS, VEHICLES } from '../../src/vehicle/vehicles'

describe('vehicle groups', () => {
  it('covers every type exactly once', () => {
    const grouped = VEHICLE_GROUPS.flatMap((g) => g.types)
    expect([...grouped].sort()).toEqual([...VEHICLE_TYPES].sort())
    expect(new Set(grouped).size, 'a type appears in two groups').toBe(grouped.length)
  })

  it('gives every type a spec keyed to itself', () => {
    for (const type of VEHICLE_TYPES) {
      expect(VEHICLES[type], type).toBeDefined()
      expect(VEHICLES[type].key, type).toBe(type)
    }
  })

  it('includes the requested car-family types', () => {
    for (const t of ['retro', 'ev', 'minivan', 'jeep']) expect(VEHICLE_TYPES).toContain(t)
  })

  it('puts the jeep in the cars group exactly once', () => {
    const carsGroup = VEHICLE_GROUPS.find((g) => g.key === 'vehGroup.cars')
    expect(carsGroup?.types.filter((t) => t === 'jeep')).toHaveLength(1)
    // and nowhere else — the covers-every-type-exactly-once check above catches
    // a duplicate, but not a jeep filed under trucks/special/exotic instead
    for (const g of VEHICLE_GROUPS) if (g !== carsGroup) expect(g.types).not.toContain('jeep')
  })

  it('tunes the jeep as an off-roader: heavier than the car, less eager, but grippy with a high top end', () => {
    const jeep = VEHICLES.jeep
    const car = VEHICLES.car
    const truck = VEHICLES.truck
    // heavier and slower off the line than the car — it is not a second sports car
    expect(jeep.radius).toBeGreaterThan(car.radius)
    expect(jeep.accel).toBeLessThan(car.accel)
    // but nowhere near as sluggish or numb as the truck — it is not a light truck
    expect(jeep.accel).toBeGreaterThan(truck.accel)
    expect(jeep.gripLateral).toBeGreaterThan(truck.gripLateral)
    expect(jeep.maxSpeed).toBeGreaterThan(truck.maxSpeed)
    // a high top gear: it keeps most of the car's top speed despite the weight
    expect(jeep.maxSpeed).toBeGreaterThan(car.maxSpeed * 0.85)
  })
})
