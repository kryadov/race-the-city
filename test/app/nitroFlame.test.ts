import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createNitroFlame } from '../../src/app/nitroFlame'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

const plumeOf = (mesh: THREE.Object3D): THREE.Object3D => mesh.children[mesh.children.length - 1]

describe('nitro flame', () => {
  it('stays hidden until the boost is lit', () => {
    const flame = createNitroFlame()
    const mesh = buildVehicleMesh('car')
    flame.attachTo(mesh)
    const plume = plumeOf(mesh)

    expect(plume.visible).toBe(false)
    flame.update(true, 0.016)
    expect(plume.visible).toBe(true)
    flame.update(false, 0.016)
    expect(plume.visible).toBe(false)
  })

  it('puts the plume behind every vehicle, never in front', () => {
    // models face +x, so the exhaust must sit at the back — negative x
    for (const type of VEHICLE_TYPES) {
      const flame = createNitroFlame()
      const mesh = buildVehicleMesh(type)
      const before = new THREE.Box3().setFromObject(mesh)
      flame.attachTo(mesh)
      for (const jet of plumeOf(mesh).children) {
        expect(jet.position.x, type).toBeLessThan(0)
        expect(jet.position.x, type).toBeLessThanOrEqual(before.min.x + 0.06)
        expect(jet.position.y, type).toBeGreaterThan(0) // above the road
      }
    }
  })

  it('flickers the two jets out of step', () => {
    const flame = createNitroFlame()
    const mesh = buildVehicleMesh('car')
    flame.attachTo(mesh)
    const jets = plumeOf(mesh).children

    flame.update(true, 0.05)
    expect(jets[0].scale.x).not.toBeCloseTo(jets[1].scale.x)

    const first = jets[0].scale.x
    flame.update(true, 0.05)
    expect(jets[0].scale.x).not.toBeCloseTo(first) // and it keeps moving
  })

  it('survives a vehicle it was never fitted to', () => {
    const flame = createNitroFlame()
    expect(() => flame.update(true, 0.016)).not.toThrow()
  })
})
