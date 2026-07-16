import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('buildVehicleMesh', () => {
  it('builds a non-empty group for every vehicle type', () => {
    for (const type of VEHICLE_TYPES) {
      const g = buildVehicleMesh(type)
      expect(g).toBeInstanceOf(THREE.Group)
      expect(g.children.length).toBeGreaterThan(3) // body + cabin + wheels at least
    }
  })

  it('gives the truck more parts than the car (extra axle)', () => {
    const truck = buildVehicleMesh('truck').children.length
    const car = buildVehicleMesh('car').children.length
    expect(truck).toBeGreaterThan(car)
  })
})
