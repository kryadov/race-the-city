import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { syncCamera, type Stage } from '../../src/app/scene'
import { createCar } from '../../src/vehicle/car'
import { steers, wheel } from '../../src/vehicle/models/parts'

const flat = { heightAt: () => 0 }

function makeStage(): { stage: Stage; frontWheel: THREE.Object3D } {
  const carMesh = new THREE.Group()
  const frontWheel = steers(wheel(0.5, 0.4, 1.3, 0.5, 0.95))
  carMesh.add(frontWheel)
  const stage = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    carMesh,
    camDist: 1,
    camDistScale: 1,
  } as unknown as Stage
  return { stage, frontWheel }
}

/**
 * The model faces +x and its local +z is its right (see the lean basis in
 * scene.ts). Steering right increases heading, which turns the car toward +z —
 * so a right-steered wheel must point its +x nose toward +z too.
 */
describe('steered wheels', () => {
  const noseDirection = (w: THREE.Object3D): THREE.Vector3 =>
    new THREE.Vector3(1, 0, 0).applyEuler(w.rotation)

  it('points the wheel the same way the car turns', () => {
    const { stage, frontWheel } = makeStage()
    const car = createCar()

    syncCamera(stage, car, 0.016, flat, 0, false, 1) // full right lock
    const right = noseDirection(frontWheel)
    expect(right.z, 'right lock must aim the nose toward +z (the car\'s right)').toBeGreaterThan(0)

    syncCamera(stage, car, 0.016, flat, 0, false, -1) // full left lock
    const left = noseDirection(frontWheel)
    expect(left.z, 'left lock must aim the nose toward -z').toBeLessThan(0)
  })

  it('centres the wheel with no steering input', () => {
    const { stage, frontWheel } = makeStage()
    syncCamera(stage, createCar(), 0.016, flat, 0, false, 0)
    expect(frontWheel.rotation.y).toBeCloseTo(0)
  })

  it('turns further at full lock than at half', () => {
    const { stage, frontWheel } = makeStage()
    syncCamera(stage, createCar(), 0.016, flat, 0, false, 0.5)
    const half = Math.abs(frontWheel.rotation.y)
    syncCamera(stage, createCar(), 0.016, flat, 0, false, 1)
    expect(Math.abs(frontWheel.rotation.y)).toBeGreaterThan(half)
  })
})
