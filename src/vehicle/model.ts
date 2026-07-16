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
  motorbike: { color: 0x5a0000, emissive: 0xff2a00 },
  bus: { color: 0x5a1200, emissive: 0xff4400 },
  racecar: { color: 0x4a0010, emissive: 0xff0033 }, // single bright rain light
  tractor: { color: 0x5a2400, emissive: 0xff6a00 },
  lorry: { color: 0x5a1e00, emissive: 0xff5a00 },
  cabrio: { color: 0x50002a, emissive: 0xff1466 },
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

const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xe0ac69, flatShading: true })
const SHIRT_MAT = new THREE.MeshStandardMaterial({ color: 0x2f5fd0, flatShading: true })
const TROUSER_MAT = new THREE.MeshStandardMaterial({ color: 0x33363d, flatShading: true })
const HELMET_MAT = new THREE.MeshStandardMaterial({ color: 0xd93b3b, flatShading: true })

/**
 * A low-poly person sitting at (x,y,z), facing +x. `helmet` gives a rider's
 * lid instead of a bare head; `legs` tucks visible legs under the torso.
 */
function person(x: number, y: number, z: number, helmet: boolean, legs: boolean): THREE.Object3D {
  const g = new THREE.Group()
  const part = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(px, py, pz)
    return m
  }
  g.add(part(0.34, 0.5, 0.42, SHIRT_MAT, 0, 0.25, 0)) // torso
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), helmet ? HELMET_MAT : SKIN_MAT)
  head.position.set(0.02, 0.66, 0)
  g.add(head)
  // arms reaching forward to the wheel/bars
  g.add(part(0.42, 0.1, 0.1, SHIRT_MAT, 0.26, 0.36, 0.19), part(0.42, 0.1, 0.1, SHIRT_MAT, 0.26, 0.36, -0.19))
  if (legs) g.add(part(0.46, 0.12, 0.14, TROUSER_MAT, 0.28, 0.04, 0.12), part(0.46, 0.12, 0.14, TROUSER_MAT, 0.28, 0.04, -0.12))
  g.position.set(x, y, z)
  return g
}

/** A small amber side-repeater on a fender (blinks with its side's material). */
function repeater(mat: THREE.MeshStandardMaterial, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.08), mat)
  m.position.set(x, y, z)
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
  g.add(repeater(TURN_RIGHT_MAT, 1.25, 0.72, 0.97), repeater(TURN_LEFT_MAT, 1.25, 0.72, -0.97))
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
  g.add(repeater(TURN_RIGHT_MAT, 1.8, 1.05, 1.11), repeater(TURN_LEFT_MAT, 1.8, 1.05, -1.11))
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
  g.add(repeater(TURN_RIGHT_MAT, 1.2, 0.55, 1.02), repeater(TURN_LEFT_MAT, 1.2, 0.55, -1.02))
  g.add(mirror(1.0, 0.95, 0.98, 1), mirror(1.0, 0.95, -0.98, -1))
  return g
}

/** Motorbike with a visible rider. The render loop banks the whole model in corners. */
function buildMotorbike(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(1.7, 0.16, 0.2, 0x2a2d34, -0.05, 0.62, 0)) // frame spine (x ∈ [-0.9, 0.85])
  g.add(box(0.6, 0.32, 0.34, 0x1b6ca8, 0.18, 0.86, 0)) // fuel tank
  g.add(box(0.55, 0.12, 0.3, 0x1a1a1e, -0.42, 0.9, 0)) // seat
  g.add(box(0.5, 0.3, 0.36, 0x1b6ca8, -0.78, 0.86, 0)) // tail unit
  g.add(box(0.1, 0.55, 0.08, 0x555a63, 0.78, 0.9, 0)) // fork
  g.add(box(0.07, 0.07, 0.72, 0x2a2d34, 0.8, 1.16, 0)) // handlebar
  g.add(wheel(0.42, 0.16, 0.85, 0.42, 0), wheel(0.42, 0.16, -0.8, 0.42, 0))
  g.add(light(1.0, 0.95, 0)) // headlight
  const rx = -0.95, fx = 0.95
  g.add(lens(REAR_LIGHT_MAT, 0.22, 0.12, rx, 0.88, 0, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.1, 0.1, rx, 0.88, 0.2, -1), lens(TURN_LEFT_MAT, 0.1, 0.1, rx, 0.88, -0.2, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.1, 0.1, fx, 1.1, 0.26, 1), lens(TURN_LEFT_MAT, 0.1, 0.1, fx, 1.1, -0.26, 1))
  g.add(person(-0.18, 0.98, 0, true, true))
  return g
}

/** City bus: long box with a window band. */
function buildBus(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(9, 2.4, 2.5, 0xf1a208, 0, 1.75, 0)) // body (x ∈ [-4.5, 4.5])
  g.add(box(8.4, 0.62, 2.54, 0x1c2733, 0, 2.35, 0)) // window band
  g.add(box(9, 0.3, 2.3, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.62, 0.42, 3.3, 1.2, 0.62))
  g.add(wheel(0.62, 0.42, 1.4, 0.62, 1.2), wheel(0.62, 0.42, 1.4, 0.62, -1.2)) // mid axle
  g.add(light(4.58, 0.95, 0.9), light(4.58, 0.95, -0.9))
  const rx = -4.5, fx = 4.5
  g.add(housingBar(0.5, 2.3, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.34, rx, 1.0, 0.6, -1), lens(REAR_LIGHT_MAT, 0.5, 0.34, rx, 1.0, -0.6, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 1.0, 1.05, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 1.0, -1.05, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.24, 0.22, fx, 0.7, 1.05, 1), lens(TURN_LEFT_MAT, 0.24, 0.22, fx, 0.7, -1.05, 1))
  g.add(repeater(TURN_RIGHT_MAT, 3.0, 1.1, 1.26), repeater(TURN_LEFT_MAT, 3.0, 1.1, -1.26))
  g.add(mirror(4.1, 1.9, 1.25, 1), mirror(4.1, 1.9, -1.25, -1))
  return g
}

/** Open-wheel race car with wings. */
function buildRaceCar(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.4, 0.36, 1.1, 0xe01b24, 0, 0.42, 0)) // tub (x ∈ [-2.2, 2.2])
  g.add(box(1.3, 0.26, 0.5, 0xe01b24, 1.7, 0.4, 0)) // nose
  g.add(box(1.1, 0.42, 0.9, 0x1a1a1e, -0.25, 0.78, 0)) // cockpit surround
  g.add(box(0.7, 0.3, 0.7, 0xe01b24, -1.25, 0.8, 0)) // airbox
  g.add(box(0.5, 0.07, 1.9, 0x1a1a1e, 2.2, 0.22, 0)) // front wing
  g.add(box(0.75, 0.08, 1.5, 0x1a1a1e, -2.05, 1.02, 0)) // rear wing
  g.add(box(0.75, 0.36, 0.07, 0xe01b24, -2.05, 0.85, 0.75), box(0.75, 0.36, 0.07, 0xe01b24, -2.05, 0.85, -0.75)) // endplates
  g.add(...fourWheels(0.5, 0.46, 1.62, 1.05, 0.5))
  g.add(person(-0.35, 0.72, 0, true, false))
  const rx = -2.2
  g.add(lens(REAR_LIGHT_MAT, 0.3, 0.12, rx, 0.5, 0, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.12, 0.1, rx, 0.5, 0.3, -1), lens(TURN_LEFT_MAT, 0.12, 0.1, rx, 0.5, -0.3, -1))
  return g
}

/** Farm tractor: big rear wheels, small front. */
function buildTractor(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(2.4, 0.8, 1.2, 0x2e7d32, 0, 1.05, 0)) // body (x ∈ [-1.2, 1.2])
  g.add(box(1.0, 1.0, 1.15, 0x1b5e20, -0.5, 1.95, 0)) // cab
  g.add(box(0.9, 0.28, 1.3, 0x33363d, 0.1, 0.5, 0)) // sump
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x33363d, flatShading: true }))
  pipe.position.set(0.75, 1.95, 0.42)
  g.add(pipe)
  g.add(wheel(0.95, 0.5, -0.85, 0.95, 0.8), wheel(0.95, 0.5, -0.85, 0.95, -0.8)) // big rear
  g.add(wheel(0.5, 0.3, 1.0, 0.5, 0.62), wheel(0.5, 0.3, 1.0, 0.5, -0.62)) // small front
  g.add(light(1.24, 1.3, 0.42), light(1.24, 1.3, -0.42))
  const rx = -1.2, fx = 1.2
  g.add(lens(REAR_LIGHT_MAT, 0.22, 0.2, rx, 1.2, 0.45, -1), lens(REAR_LIGHT_MAT, 0.22, 0.2, rx, 1.2, -0.45, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.14, 0.14, rx, 1.2, 0.7, -1), lens(TURN_LEFT_MAT, 0.14, 0.14, rx, 1.2, -0.7, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.14, 0.14, fx, 1.3, 0.7, 1), lens(TURN_LEFT_MAT, 0.14, 0.14, fx, 1.3, -0.7, 1))
  return g
}

/** Articulated lorry: cab plus a long trailer. */
function buildLorry(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(8.2, 2.7, 2.5, 0xecf0f1, -2.5, 2.15, 0)) // trailer (rear at x = -6.6)
  g.add(box(2.4, 2.2, 2.45, 0xc0392b, 2.5, 1.8, 0)) // cab (front at x = 3.7)
  g.add(box(2.3, 0.5, 2.3, 0x2a3440, 2.5, 0.6, 0)) // cab chassis
  g.add(box(8.0, 0.3, 2.2, 0x2a3440, -2.5, 0.85, 0)) // trailer chassis
  g.add(box(0.5, 1.4, 2.2, 0x8e1b12, 1.35, 2.6, 0)) // cab-to-trailer fairing
  g.add(wheel(0.65, 0.45, 3.0, 0.65, 1.15), wheel(0.65, 0.45, 3.0, 0.65, -1.15)) // steer axle
  g.add(wheel(0.65, 0.45, 1.5, 0.65, 1.15), wheel(0.65, 0.45, 1.5, 0.65, -1.15)) // drive axle
  for (const wx of [-4.2, -5.4]) g.add(wheel(0.65, 0.45, wx, 0.65, 1.15), wheel(0.65, 0.45, wx, 0.65, -1.15))
  g.add(light(3.78, 1.05, 0.95), light(3.78, 1.05, -0.95))
  const rx = -6.6, fx = 3.7
  g.add(housingBar(0.52, 2.3, rx, 1.15, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 1.15, 0.6, -1), lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 1.15, -0.6, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 1.15, 1.02, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 1.15, -1.02, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.22, fx, 0.8, 1.05, 1), lens(TURN_LEFT_MAT, 0.22, 0.22, fx, 0.8, -1.05, 1))
  g.add(repeater(TURN_RIGHT_MAT, 2.0, 1.2, 1.26), repeater(TURN_LEFT_MAT, 2.0, 1.2, -1.26))
  g.add(mirror(3.3, 2.1, 1.25, 1), mirror(3.3, 2.1, -1.25, -1))
  return g
}

/** Convertible with a visible driver (no roof). */
function buildCabrio(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.1, 0.78, 1.95, 0x8e44ad, 0, 0.64, 0)) // body (x ∈ [-2.05, 2.05])
  g.add(box(1.9, 0.3, 1.6, 0x2c1338, -0.35, 1.06, 0)) // open cockpit floor
  g.add(box(0.12, 0.42, 1.55, 0x1c2733, 0.62, 1.28, 0)) // windscreen
  g.add(box(0.5, 0.34, 1.5, 0x5b2d7a, -1.35, 1.2, 0)) // folded roof / rear deck
  g.add(...fourWheels(0.48, 0.4, 1.35, 0.95, 0.45))
  g.add(person(-0.25, 1.0, 0.36, false, false)) // driver, head above the screen
  g.add(light(2.13, 0.66, 0.7), light(2.13, 0.66, -0.7))
  const rx = -2.05, fx = 2.05
  g.add(housingBar(0.44, 1.9, rx, 0.74, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.44, 0.3, rx, 0.74, 0.4, -1), lens(REAR_LIGHT_MAT, 0.44, 0.3, rx, 0.74, -0.4, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.24, 0.22, rx, 0.74, 0.82, -1), lens(TURN_LEFT_MAT, 0.24, 0.22, rx, 0.74, -0.82, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.2, fx, 0.62, 0.86, 1), lens(TURN_LEFT_MAT, 0.2, 0.2, fx, 0.62, -0.86, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.3, 0.74, 0.99), repeater(TURN_LEFT_MAT, 1.3, 0.74, -0.99))
  g.add(mirror(0.75, 1.2, 0.97, 1), mirror(0.75, 1.2, -0.97, -1))
  return g
}

const BUILDERS: Record<VehicleType, () => THREE.Group> = {
  car: buildCar,
  truck: buildTruck,
  sports: buildSports,
  motorbike: buildMotorbike,
  bus: buildBus,
  racecar: buildRaceCar,
  tractor: buildTractor,
  lorry: buildLorry,
  cabrio: buildCabrio,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  const s = STOP_STYLE[type] // tint the shared stop material to match this vehicle
  REAR_LIGHT_MAT.color.setHex(s.color)
  REAR_LIGHT_MAT.emissive.setHex(s.emissive)
  return BUILDERS[type]()
}
