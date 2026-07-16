import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES, HOVERS } from '../../src/vehicle/vehicles'

describe('buildVehicleMesh', () => {
  it('builds a non-empty group for every vehicle type', () => {
    for (const type of VEHICLE_TYPES) {
      const g = buildVehicleMesh(type)
      expect(g, type).toBeInstanceOf(THREE.Group)
      expect(g.children.length, type).toBeGreaterThan(3) // body + cabin + wheels at least
    }
  })

  it('gives the truck more parts than the car (extra axle)', () => {
    const truck = buildVehicleMesh('truck').children.length
    const car = buildVehicleMesh('car').children.length
    expect(truck).toBeGreaterThan(car)
  })

  it('tags wheels with a radius so the render loop can spin them', () => {
    const g = buildVehicleMesh('car')
    const wheels = g.children.filter((c) => typeof c.userData.wheelRadius === 'number')
    expect(wheels).toHaveLength(4)
  })

  it('gives every wheeled vehicle spinnable wheels', () => {
    // syncCamera spins anything tagged wheelRadius; without the tag a model looks frozen.
    for (const type of VEHICLE_TYPES) {
      if (HOVERS[type]) continue // floats — no wheels by design
      let wheels = 0
      buildVehicleMesh(type).traverse((o) => {
        if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
      })
      expect(wheels, type).toBeGreaterThan(0)
    }
  })

  it('builds the hovercar with no wheels', () => {
    let wheels = 0
    buildVehicleMesh('hover').traverse((o) => {
      if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
    })
    expect(wheels).toBe(0)
  })
})
