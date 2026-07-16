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
})
