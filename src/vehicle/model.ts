import * as THREE from 'three'
import type { VehicleType } from './vehicles'

// Models point +x (heading 0 faces +x). Units are metres.

/** Rear-light glow: dim while cruising, bright while braking. */
export const REAR_LIGHT_IDLE = 0.45
export const REAR_LIGHT_BRAKE = 2.0

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, flatShading: true }),
  )
  m.position.set(x, y, z)
  return m
}

/**
 * A wheel (axle along z, rolls along x): dark tire + light rim + a spoke bar so
 * the spin is visible. The whole group is tagged so the render loop rotates it.
 */
function wheel(radius: number, width: number, x: number, y: number, z: number): THREE.Object3D {
  const g = new THREE.Group()
  const mat = (c: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: c, flatShading: true })

  const tire = new THREE.CylinderGeometry(radius, radius, width, 14)
  tire.rotateX(Math.PI / 2) // axle Y → Z
  g.add(new THREE.Mesh(tire, mat(0x141418)))

  const rim = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 1.06, 12)
  rim.rotateX(Math.PI / 2)
  g.add(new THREE.Mesh(rim, mat(0xc2c6ce)))

  // spoke bar across the rim (in the wheel's xy plane) to read rotation
  g.add(new THREE.Mesh(new THREE.BoxGeometry(radius * 1.5, radius * 0.16, width * 1.08), mat(0x6a6f78)))

  g.position.set(x, y, z)
  g.userData.wheelRadius = radius // render loop spins this group by rolling distance
  return g
}

function fourWheels(radius: number, width: number, axleX: number, halfTrack: number, y: number): THREE.Object3D[] {
  return [
    wheel(radius, width, axleX, y, halfTrack),
    wheel(radius, width, axleX, y, -halfTrack),
    wheel(radius, width, -axleX, y, halfTrack),
    wheel(radius, width, -axleX, y, -halfTrack),
  ]
}

const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xfff2c0,
  emissive: 0xfff2c0,
  emissiveIntensity: 1.2,
  flatShading: true,
})

/** A glowing headlight at the vehicle's front. */
function light(x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), HEADLIGHT_MAT)
  m.position.set(x, y, z)
  return m
}

/**
 * Shared rear-light material: dim red tail lights that the render loop
 * brightens on braking. One material for every vehicle → the loop sets its
 * emissiveIntensity once per frame with zero per-mesh work.
 */
export const REAR_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0x5a0000,
  emissive: 0xff1400,
  emissiveIntensity: REAR_LIGHT_IDLE,
  flatShading: true,
})

// Amber turn-signals. Left and right are separate materials so the loop can
// blink one side independently; colour is clearly distinct from the red brakes.
// The model faces +x, so its left side is -z and its right side is +z.
const amber = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x3a2600, emissive: 0xffa000, emissiveIntensity: 0, flatShading: true })
export const TURN_LEFT_MAT = amber()
export const TURN_RIGHT_MAT = amber()

const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, flatShading: true })

/** A tail/brake light block set into a dark housing (housing sits just behind it). */
function tailLight(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Object3D {
  const g = new THREE.Group()
  const housing = new THREE.Mesh(new THREE.BoxGeometry(d * 0.6, h + 0.14, w + 0.14), HOUSING_MAT)
  housing.position.set(x - d * 0.35, y, z)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), REAR_LIGHT_MAT)
  lamp.position.set(x, y, z)
  g.add(housing, lamp)
  return g
}

/** A turn-signal lamp; `mat` selects which side blinks. */
function turn(mat: THREE.MeshStandardMaterial, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat)
  m.position.set(x, y, z)
  return m
}

function buildCar(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4, 0.8, 1.9, 0xe63946, 0, 0.65, 0)) // body
  g.add(box(2.1, 0.7, 1.7, 0xb5303b, -0.15, 1.25, 0)) // cabin
  g.add(...fourWheels(0.5, 0.4, 1.3, 0.95, 0.45))
  g.add(light(2, 0.65, 0.7), light(2, 0.65, -0.7))
  // saloon: tall vertical tail-light blocks in the corners
  g.add(tailLight(0.16, 0.42, 0.14, -2, 0.72, 0.72), tailLight(0.16, 0.42, 0.14, -2, 0.72, -0.72))
  g.add(turn(TURN_RIGHT_MAT, -2.0, 0.5, 0.92), turn(TURN_LEFT_MAT, -2.0, 0.5, -0.92))
  g.add(turn(TURN_RIGHT_MAT, 2.02, 0.55, 0.9), turn(TURN_LEFT_MAT, 2.02, 0.55, -0.9))
  return g
}

function buildTruck(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.2, 1.7, 2.2, 0x5b7186, -1.3, 1.45, 0)) // cargo box
  g.add(box(2.0, 1.2, 2.15, 0xffb703, 2.0, 1.15, 0)) // cab (lower than the cargo)
  g.add(box(7.0, 0.4, 2.0, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.72, 0.5, 2.1, 1.05, 0.7))
  g.add(wheel(0.72, 0.5, -0.4, 0.7, 1.05)) // extra rear axle
  g.add(wheel(0.72, 0.5, -0.4, 0.7, -1.05))
  g.add(light(3, 1.1, 0.9), light(3, 1.1, -0.9))
  // lorry: a stacked pair of round-ish light blocks each side, low on the cargo
  g.add(tailLight(0.34, 0.24, 0.14, -3.4, 1.2, 0.92), tailLight(0.34, 0.24, 0.14, -3.4, 0.85, 0.92))
  g.add(tailLight(0.34, 0.24, 0.14, -3.4, 1.2, -0.92), tailLight(0.34, 0.24, 0.14, -3.4, 0.85, -0.92))
  g.add(turn(TURN_RIGHT_MAT, -3.4, 0.55, 1.02), turn(TURN_LEFT_MAT, -3.4, 0.55, -1.02))
  g.add(turn(TURN_RIGHT_MAT, 2.95, 0.7, 1.0), turn(TURN_LEFT_MAT, 2.95, 0.7, -1.0))
  return g
}

function buildSports(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.3, 0.55, 2.0, 0x00b4d8, 0, 0.5, 0)) // low body
  g.add(box(1.7, 0.45, 1.6, 0x0077b6, 0.1, 0.95, 0)) // low cabin
  g.add(box(1.0, 0.12, 1.9, 0x023047, -1.9, 0.95, 0)) // rear wing
  g.add(...fourWheels(0.46, 0.45, 1.45, 1.0, 0.42))
  g.add(light(2.1, 0.5, 0.75), light(2.1, 0.5, -0.75))
  // sports: a single full-width slim light bar across the tail
  g.add(tailLight(1.5, 0.12, 0.1, -2.12, 0.6, 0))
  g.add(turn(TURN_RIGHT_MAT, -2.1, 0.5, 0.82), turn(TURN_LEFT_MAT, -2.1, 0.5, -0.82))
  g.add(turn(TURN_RIGHT_MAT, 2.12, 0.45, 0.78), turn(TURN_LEFT_MAT, 2.12, 0.45, -0.78))
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
