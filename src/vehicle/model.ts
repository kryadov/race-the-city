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
 * Shared stop-light material: dim tail lights that the render loop brightens on
 * braking. buildVehicleMesh() tints it per vehicle; the loop sets its
 * emissiveIntensity once per frame, so every stop lens updates with no per-mesh work.
 */
export const REAR_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0x5a0000,
  emissive: 0xff1400,
  emissiveIntensity: REAR_LIGHT_IDLE,
  flatShading: true,
})

// Per-vehicle stop-light colour so the cluster reads as part of the car's style.
const STOP_STYLE: Record<VehicleType, { color: number; emissive: number }> = {
  car: { color: 0x5a0000, emissive: 0xff1400 }, // classic red
  truck: { color: 0x5a1e00, emissive: 0xff5a00 }, // amber-red
  sports: { color: 0x4a0022, emissive: 0xff0055 }, // magenta LED
}

// Amber turn-signals. Left and right are separate materials so the loop can
// blink one side independently. The model faces +x, so its left is -z, right +z.
const amber = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x3a2600, emissive: 0xffb000, emissiveIntensity: 0, flatShading: true })
export const TURN_LEFT_MAT = amber()
export const TURN_RIGHT_MAT = amber()

const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x141418, flatShading: true })
const MIRROR_MAT = new THREE.MeshStandardMaterial({ color: 0x24242a, flatShading: true })

const LENS_D = 0.09 // lens thickness along x
const HOUSING_D = 0.14 // housing thickness along x
const LENS_PROUD = 0.06 // lens outward face sits this far beyond the body surface
const HOUSING_PROUD = 0.025 // housing frame sits proud too, but behind the lenses

/**
 * A light lens standing proud of the body so it always faces the viewer and
 * never z-fights the body panel. `surfX` is the body's outward surface x; `face`
 * is the outward direction (-1 = rear, +1 = front).
 */
function lens(mat: THREE.MeshStandardMaterial, w: number, h: number, surfX: number, y: number, z: number, face: number): THREE.Mesh {
  const outFace = surfX + face * LENS_PROUD
  const m = new THREE.Mesh(new THREE.BoxGeometry(LENS_D, h, w), mat)
  m.position.set(outFace - face * (LENS_D / 2), y, z)
  return m
}

/** A dark housing frame just behind the lenses (also proud of the body, so it reads as a recessed cluster). */
function housingBar(h: number, w: number, surfX: number, y: number, z: number, face: number): THREE.Mesh {
  const outFace = surfX + face * HOUSING_PROUD
  const m = new THREE.Mesh(new THREE.BoxGeometry(HOUSING_D, h, w), HOUSING_MAT)
  m.position.set(outFace - face * (HOUSING_D / 2), y, z)
  return m
}

/** A small, tucked side mirror: a short stalk and a compact dark head. */
function mirror(x: number, y: number, zBody: number, out: number): THREE.Object3D {
  const g = new THREE.Group()
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), MIRROR_MAT)
  arm.position.set(x, y, zBody + out * 0.09)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.13), MIRROR_MAT)
  head.position.set(x - 0.02, y + 0.02, zBody + out * 0.19)
  g.add(arm, head)
  return g
}

function buildCar(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4, 0.8, 1.9, 0xe63946, 0, 0.65, 0)) // body (x ∈ [-2, 2])
  g.add(box(2.1, 0.7, 1.7, 0xb5303b, -0.15, 1.25, 0)) // cabin
  g.add(...fourWheels(0.5, 0.4, 1.3, 0.95, 0.45))
  g.add(light(2.08, 0.65, 0.7), light(2.08, 0.65, -0.7)) // headlights, slightly proud
  // rear cluster: a dark housing bar carrying red stops + amber indicators, all proud
  const rx = -2.0, fx = 2.0
  g.add(housingBar(0.5, 1.9, rx, 0.72, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.44, 0.34, rx, 0.72, 0.4, -1), lens(REAR_LIGHT_MAT, 0.44, 0.34, rx, 0.72, -0.4, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.24, 0.24, rx, 0.72, 0.82, -1), lens(TURN_LEFT_MAT, 0.24, 0.24, rx, 0.72, -0.82, -1))
  // front indicators beside the headlights + side mirrors on the cabin
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.2, fx, 0.62, 0.86, 1), lens(TURN_LEFT_MAT, 0.2, 0.2, fx, 0.62, -0.86, 1))
  g.add(mirror(0.8, 1.2, 0.95, 1), mirror(0.8, 1.2, -0.95, -1))
  return g
}

function buildTruck(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.2, 1.7, 2.2, 0x5b7186, -1.3, 1.45, 0)) // cargo box (rear at x = -3.4)
  g.add(box(2.0, 1.2, 2.15, 0xffb703, 2.0, 1.15, 0)) // cab (front at x = 3.0)
  g.add(box(7.0, 0.4, 2.0, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.72, 0.5, 2.1, 1.05, 0.7))
  g.add(wheel(0.72, 0.5, -0.4, 0.7, 1.05)) // extra rear axle
  g.add(wheel(0.72, 0.5, -0.4, 0.7, -1.05))
  g.add(light(3.08, 1.1, 0.9), light(3.08, 1.1, -0.9)) // headlights, slightly proud
  // rear cluster low on the cargo
  const rx = -3.4, fx = 3.0
  g.add(housingBar(0.52, 2.3, rx, 0.98, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 0.98, 0.55, -1), lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 0.98, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 0.98, 0.98, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 0.98, -0.98, -1))
  // front indicators + mirrors on the cab
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.22, fx, 0.75, 0.98, 1), lens(TURN_LEFT_MAT, 0.22, 0.22, fx, 0.75, -0.98, 1))
  g.add(mirror(2.4, 1.5, 1.05, 1), mirror(2.4, 1.5, -1.05, -1))
  return g
}

function buildSports(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.3, 0.55, 2.0, 0x00b4d8, 0, 0.5, 0)) // low body (x ∈ [-2.15, 2.15])
  g.add(box(1.7, 0.45, 1.6, 0x0077b6, 0.1, 0.95, 0)) // low cabin
  g.add(box(1.0, 0.12, 1.9, 0x023047, -1.9, 0.95, 0)) // rear wing
  g.add(...fourWheels(0.46, 0.45, 1.45, 1.0, 0.42))
  g.add(light(2.23, 0.5, 0.75), light(2.23, 0.5, -0.75)) // headlights, slightly proud
  // sports: a slim LED strip across the tail with amber tips, all on one housing bar
  const rx = -2.15, fx = 2.15
  g.add(housingBar(0.22, 1.95, rx, 0.6, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 1.1, 0.12, rx, 0.6, 0, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.24, 0.12, rx, 0.6, 0.82, -1), lens(TURN_LEFT_MAT, 0.24, 0.12, rx, 0.6, -0.82, -1))
  // front indicators + mirrors
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.14, fx, 0.5, 0.8, 1), lens(TURN_LEFT_MAT, 0.2, 0.14, fx, 0.5, -0.8, 1))
  g.add(mirror(1.0, 0.95, 0.98, 1), mirror(1.0, 0.95, -0.98, -1))
  return g
}

const BUILDERS: Record<VehicleType, () => THREE.Group> = {
  car: buildCar,
  truck: buildTruck,
  sports: buildSports,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  const s = STOP_STYLE[type] // tint the shared stop material to match this vehicle
  REAR_LIGHT_MAT.color.setHex(s.color)
  REAR_LIGHT_MAT.emissive.setHex(s.emissive)
  return BUILDERS[type]()
}
