import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES, HOVERS } from '../../src/vehicle/vehicles'

/** World-space y of a model's wheel axle (all four sit at the same height here). */
function axleHeight(type: (typeof VEHICLE_TYPES)[number]): number {
  let y = 0
  buildVehicleMesh(type).traverse((o) => {
    if (typeof (o.userData as { wheelRadius?: number }).wheelRadius === 'number') y = o.position.y
  })
  return y
}

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

  it('gives the wheeled vehicles a steered axle', () => {
    // tracked runs on tracks and the roller articulates its frame; neither yaws a wheel
    const noSteer = new Set(['hover', 'tracked', 'roller'])
    for (const type of VEHICLE_TYPES) {
      if (noSteer.has(type)) continue
      let steered = 0
      buildVehicleMesh(type).traverse((o) => {
        if ((o.userData as { steers?: boolean }).steers) steered++
      })
      expect(steered, type).toBeGreaterThan(0)
    }
  })

  it('never steers a wheel it cannot spin', () => {
    // a steered mark on a non-wheel would yaw some random box
    for (const type of VEHICLE_TYPES) {
      buildVehicleMesh(type).traverse((o) => {
        const d = o.userData as { wheelRadius?: number; steers?: boolean }
        if (d.steers) expect(d.wheelRadius, type).toBeGreaterThan(0)
      })
    }
  })

  it('leaves the tracked hull with nothing that steers', () => {
    let steered = 0
    buildVehicleMesh('tracked').traverse((o) => {
      if ((o.userData as { steers?: boolean }).steers) steered++
    })
    expect(steered).toBe(0)
  })

  it('builds the hovercar with no wheels', () => {
    let wheels = 0
    buildVehicleMesh('hover').traverse((o) => {
      if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
    })
    expect(wheels).toBe(0)
  })

  it('gives the jeep exactly four wheels, the front pair steering', () => {
    // the tailgate spare reuses wheel() for its look but is stripped of the
    // wheelRadius tag, so it must not be counted as a fifth wheel here
    const wheels: THREE.Object3D[] = []
    buildVehicleMesh('jeep').traverse((o) => {
      if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels.push(o)
    })
    expect(wheels).toHaveLength(4)
    const steering = wheels.filter((w) => (w.userData as { steers?: boolean }).steers)
    expect(steering).toHaveLength(2)
  })

  it('sits the jeep higher off the ground than the plain car', () => {
    // the off-roader's whole point is a raised stance with a visible suspension
    // gap under the body — that starts with a taller wheel axle than the car's
    expect(axleHeight('jeep')).toBeGreaterThan(axleHeight('car'))
  })
})
