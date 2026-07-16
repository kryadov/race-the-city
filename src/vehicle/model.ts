import * as THREE from 'three'
import type { VehicleType } from './vehicles'

// Models point +x (heading 0 faces +x). Units are metres.

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, flatShading: true }),
  )
  m.position.set(x, y, z)
  return m
}

/** A wheel: cylinder with its axle along z (rolls forward along x). */
function wheel(radius: number, width: number, x: number, y: number, z: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 12)
  geo.rotateX(Math.PI / 2) // axle Y → Z
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1a1e, flatShading: true }))
  m.position.set(x, y, z)
  return m
}

function fourWheels(radius: number, width: number, axleX: number, halfTrack: number, y: number): THREE.Mesh[] {
  return [
    wheel(radius, width, axleX, y, halfTrack),
    wheel(radius, width, axleX, y, -halfTrack),
    wheel(radius, width, -axleX, y, halfTrack),
    wheel(radius, width, -axleX, y, -halfTrack),
  ]
}

function buildCar(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4, 0.8, 1.9, 0xe63946, 0, 0.65, 0)) // body
  g.add(box(2.1, 0.7, 1.7, 0xb5303b, -0.15, 1.25, 0)) // cabin
  g.add(...fourWheels(0.5, 0.4, 1.3, 0.95, 0.45))
  return g
}

function buildTruck(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.2, 1.7, 2.2, 0x5b7186, -1.3, 1.45, 0)) // cargo box
  g.add(box(2.0, 1.7, 2.15, 0xffb703, 2.0, 1.35, 0)) // cab
  g.add(box(7.0, 0.4, 2.0, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.72, 0.5, 2.1, 1.05, 0.7))
  g.add(wheel(0.72, 0.5, -0.4, 0.7, 1.05)) // extra rear axle
  g.add(wheel(0.72, 0.5, -0.4, 0.7, -1.05))
  return g
}

function buildSports(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.3, 0.55, 2.0, 0x00b4d8, 0, 0.5, 0)) // low body
  g.add(box(1.7, 0.45, 1.6, 0x0077b6, 0.1, 0.95, 0)) // low cabin
  g.add(box(1.0, 0.12, 1.9, 0x023047, -1.9, 0.95, 0)) // rear wing
  g.add(...fourWheels(0.46, 0.45, 1.45, 1.0, 0.42))
  return g
}

const BUILDERS: Record<VehicleType, () => THREE.Group> = {
  car: buildCar,
  truck: buildTruck,
  sports: buildSports,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  return BUILDERS[type]()
}
