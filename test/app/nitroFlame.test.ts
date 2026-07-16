import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createNitroFlame } from '../../src/app/nitroFlame'
import { buildVehicleMesh } from '../../src/vehicle/model'


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

  it('fires out of a declared exhaust when the model has one', () => {
    // a tractor's stack points at the sky, not out the back
    for (const type of ['tractor', 'combine', 'roller', 'crane', 'tiller', 'tracked'] as const) {
      const mesh = buildVehicleMesh(type)
      const marks: THREE.Object3D[] = []
      mesh.traverse((o) => {
        if ((o.userData as { exhaust?: string }).exhaust) marks.push(o)
      })
      expect(marks.length, `${type} should declare an exhaust`).toBeGreaterThan(0)

      createNitroFlame().attachTo(mesh)
      const jets = plumeOf(mesh).children
      expect(jets.length, type).toBe(marks.length)
      for (const j of jets) {
        const at = marks.some((m) => m.position.distanceTo(j.position) < 0.001)
        expect(at, `${type} jet must sit on its exhaust`).toBe(true)
        expect(j.rotation.z, `${type} stack must fire upward`).toBeCloseTo(-Math.PI / 2)
      }
    }
  })

  it('falls back to the rear face for anything without one', () => {
    // models face +x, so a tailpipe plume sits at negative x
    for (const type of ['car', 'sports', 'truck', 'bus', 'lorry', 'minivan'] as const) {
      const flame = createNitroFlame()
      const mesh = buildVehicleMesh(type)
      const before = new THREE.Box3().setFromObject(mesh)
      flame.attachTo(mesh)
      for (const jet of plumeOf(mesh).children) {
        expect(jet.position.x, type).toBeLessThan(0)
        expect(jet.position.x, type).toBeLessThanOrEqual(before.min.x + 0.06)
        expect(jet.position.y, type).toBeGreaterThan(0) // above the road
        expect(jet.rotation.z, type).toBeCloseTo(0) // fires backwards, not up
      }
    }
  })

  it('never fires the tiller out of its trailer', () => {
    const mesh = buildVehicleMesh('tiller')
    const box = new THREE.Box3().setFromObject(mesh)
    createNitroFlame().attachTo(mesh)
    for (const jet of plumeOf(mesh).children) {
      expect(jet.position.x).toBeGreaterThan(box.min.x + 1) // well clear of the tailboard
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
