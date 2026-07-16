import * as THREE from 'three'

// Models point +x (heading 0 faces +x). Units are metres.

/** Rear-light glow: dim while cruising, bright while braking. */
export const REAR_LIGHT_IDLE = 0.45
export const REAR_LIGHT_BRAKE = 2.0

export function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
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
export function wheel(radius: number, width: number, x: number, y: number, z: number): THREE.Object3D {
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

/**
 * Mark where a vehicle's exhaust actually is, for the nitro plume. Without one,
 * the plume falls back to the middle of the mesh's rear face — right for a car,
 * wrong for a tractor (its stack points at the sky) and wrong for the tiller
 * (whose rear face is its trailer's tailboard).
 *
 * @param up true for a vertical stack, false for a tailpipe firing backwards
 */
export function exhaust(x: number, y: number, z: number, up = false): THREE.Object3D {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  o.userData.exhaust = up ? 'up' : 'back'
  return o
}

/**
 * Mark a wheel as steered: the render loop yaws it with the steering input.
 * Which axle steers is the vehicle's business — a combine steers on its rear
 * wheels, a tracked hull steers on neither — so it is tagged, not inferred.
 */
export function steers<T extends THREE.Object3D>(w: T): T {
  w.userData.steers = true
  return w
}

/** Four wheels on two axles; the front pair steers, as on most things. */
export function fourWheels(radius: number, width: number, axleX: number, halfTrack: number, y: number): THREE.Object3D[] {
  return [
    steers(wheel(radius, width, axleX, y, halfTrack)),
    steers(wheel(radius, width, axleX, y, -halfTrack)),
    wheel(radius, width, -axleX, y, halfTrack),
    wheel(radius, width, -axleX, y, -halfTrack),
  ]
}

export const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xfff2c0,
  emissive: 0xfff2c0,
  emissiveIntensity: 1.2,
  flatShading: true,
})

/** A glowing headlight at the vehicle's front. */
export function light(x: number, y: number, z: number): THREE.Mesh {
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

// Amber turn-signals. Left and right are separate materials so the loop can
// blink one side independently. The model faces +x, so its left is -z, right +z.
const amber = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x3a2600, emissive: 0xffb000, emissiveIntensity: 0, flatShading: true })
export const TURN_LEFT_MAT = amber()
export const TURN_RIGHT_MAT = amber()

export const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x141418, flatShading: true })
export const MIRROR_MAT = new THREE.MeshStandardMaterial({ color: 0x24242a, flatShading: true })

export const LENS_D = 0.09 // lens thickness along x
export const HOUSING_D = 0.14 // housing thickness along x
export const LENS_PROUD = 0.06 // lens outward face sits this far beyond the body surface
export const HOUSING_PROUD = 0.025 // housing frame sits proud too, but behind the lenses

/**
 * A light lens standing proud of the body so it always faces the viewer and
 * never z-fights the body panel. `surfX` is the body's outward surface x; `face`
 * is the outward direction (-1 = rear, +1 = front).
 */
export function lens(mat: THREE.MeshStandardMaterial, w: number, h: number, surfX: number, y: number, z: number, face: number): THREE.Mesh {
  const outFace = surfX + face * LENS_PROUD
  const m = new THREE.Mesh(new THREE.BoxGeometry(LENS_D, h, w), mat)
  m.position.set(outFace - face * (LENS_D / 2), y, z)
  return m
}

/** A dark housing frame just behind the lenses (also proud of the body, so it reads as a recessed cluster). */
export function housingBar(h: number, w: number, surfX: number, y: number, z: number, face: number): THREE.Mesh {
  const outFace = surfX + face * HOUSING_PROUD
  const m = new THREE.Mesh(new THREE.BoxGeometry(HOUSING_D, h, w), HOUSING_MAT)
  m.position.set(outFace - face * (HOUSING_D / 2), y, z)
  return m
}

/** Tinted glass shared by every cabin window. */
export const GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x22303f,
  transparent: true,
  opacity: 0.5,
  roughness: 0.1,
  flatShading: true,
})

/** A window pane. Dimensions follow box(): w=x, h=y, d=z. */
export function glass(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), GLASS_MAT)
  m.position.set(x, y, z)
  return m
}

export const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xe0ac69, flatShading: true })
export const SHIRT_MAT = new THREE.MeshStandardMaterial({ color: 0x2f5fd0, flatShading: true })
export const TROUSER_MAT = new THREE.MeshStandardMaterial({ color: 0x33363d, flatShading: true })
export const HELMET_MAT = new THREE.MeshStandardMaterial({ color: 0xd93b3b, flatShading: true })

/**
 * A low-poly person sitting at (x,y,z), facing +x. `helmet` gives a rider's
 * lid instead of a bare head; `legs` tucks visible legs under the torso.
 */
export function person(x: number, y: number, z: number, helmet: boolean, legs: boolean): THREE.Object3D {
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
export function repeater(mat: THREE.MeshStandardMaterial, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.08), mat)
  m.position.set(x, y, z)
  return m
}

/** A small, tucked side mirror: a short stalk and a compact dark head. */
export function mirror(x: number, y: number, zBody: number, out: number): THREE.Object3D {
  const g = new THREE.Group()
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), MIRROR_MAT)
  arm.position.set(x, y, zBody + out * 0.09)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.13), MIRROR_MAT)
  head.position.set(x - 0.02, y + 0.02, zBody + out * 0.19)
  g.add(arm, head)
  return g
}
