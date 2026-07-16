import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('vehicle models', () => {
  it('builds a mesh for every declared type', () => {
    for (const type of VEHICLE_TYPES) {
      const mesh = buildVehicleMesh(type)
      expect(mesh, type).toBeInstanceOf(THREE.Group)
      expect(mesh.children.length, type).toBeGreaterThan(0)
    }
  })

  it('gives every wheeled vehicle spinnable wheels', () => {
    // syncCamera spins anything tagged wheelRadius; without the tag a model looks frozen.
    for (const type of VEHICLE_TYPES) {
      let wheels = 0
      buildVehicleMesh(type).traverse((o) => {
        if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
      })
      expect(wheels, type).toBeGreaterThan(0)
    }
  })
})
