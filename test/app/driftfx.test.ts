import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { wheelPrint } from '../../src/vehicle/model'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { createDriftFx } from '../../src/app/driftfx'
import { createCar } from '../../src/vehicle/car'

const flat = { heightAt: () => 0 }

/** A hard sideways slide: enough lateral speed and forward speed to mark. */
const sliding = { ...createCar(0, 0), vx: 20, vz: 8 }

/** The width of instance `i` of the skid marks, in metres across the track. */
function markWidth(scene: THREE.Scene, i = 0): number {
  const marks = scene.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh
  const m = new THREE.Matrix4()
  marks.getMatrixAt(i, m)
  const scale = new THREE.Vector3()
  m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
  const geo = marks.geometry as THREE.PlaneGeometry
  return scale.z * geo.parameters.height
}

describe('wheelPrint', () => {
  it('measures the rear wheels of a model rather than guessing', () => {
    const print = wheelPrint(buildVehicleMesh('car'))!
    expect(print.width).toBeGreaterThan(0)
    expect(print.track).toBeGreaterThan(0)
    // The rear axle is behind the middle: the model's nose is its local +x.
    expect(print.rear).toBeGreaterThan(0)
  })

  it('gives a motorbike a narrower tyre than a lorry', () => {
    expect(wheelPrint(buildVehicleMesh('motorbike'))!.width).toBeLessThan(
      wheelPrint(buildVehicleMesh('lorry'))!.width,
    )
  })

  it('has nothing to measure on a hovercar, which has no wheels', () => {
    expect(wheelPrint(buildVehicleMesh('hover'))).toBeNull()
  })
})

describe('skid marks', () => {
  it('lays a mark as wide as the tyre that made it', () => {
    const scene = new THREE.Scene()
    const fx = createDriftFx(scene)
    const print = wheelPrint(buildVehicleMesh('lorry'))
    expect(print).not.toBeNull()
    fx.setPrint(print)
    fx.update(sliding, 1 / 60, flat)
    expect(markWidth(scene)).toBeCloseTo(print!.width, 3)
  })

  it('lays a narrower one for a narrower tyre', () => {
    const wide = new THREE.Scene()
    const wideFx = createDriftFx(wide)
    wideFx.setPrint(wheelPrint(buildVehicleMesh('lorry')))
    wideFx.update(sliding, 1 / 60, flat)

    const thin = new THREE.Scene()
    const thinFx = createDriftFx(thin)
    thinFx.setPrint(wheelPrint(buildVehicleMesh('motorbike')))
    thinFx.update(sliding, 1 / 60, flat)

    expect(markWidth(thin)).toBeLessThan(markWidth(wide))
  })

  it('marks where the wheels are, not at a fixed width for everything', () => {
    const scene = new THREE.Scene()
    const fx = createDriftFx(scene)
    const print = wheelPrint(buildVehicleMesh('lorry'))!
    fx.setPrint(print)
    fx.update({ ...createCar(0, 0), vx: 20, vz: 8 }, 1 / 60, flat)
    const marks = scene.children.find(
      (c) => (c as THREE.InstancedMesh).isInstancedMesh,
    ) as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    marks.getMatrixAt(0, m)
    a.setFromMatrixPosition(m)
    marks.getMatrixAt(1, m)
    b.setFromMatrixPosition(m)
    // Two marks, one per rear wheel, a full track apart.
    expect(a.distanceTo(b)).toBeCloseTo(print.track * 2, 2)
  })
})
