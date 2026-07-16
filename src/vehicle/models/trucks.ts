import * as THREE from 'three'
import {
  box, wheel, steers, fourWheels, light, lens, housingBar, glass, repeater, mirror,
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT,
} from './parts'

export function buildTruck(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.2, 1.7, 2.2, 0x5b7186, -1.3, 1.45, 0)) // cargo box (rear at x = -3.4)
  g.add(box(2.0, 1.2, 2.15, 0xffb703, 2.0, 1.15, 0)) // cab (front at x = 3.0)
  g.add(glass(0.07, 0.6, 1.85, 3.01, 1.4, 0)) // windscreen
  g.add(glass(1.5, 0.5, 0.06, 1.9, 1.4, 1.08), glass(1.5, 0.5, 0.06, 1.9, 1.4, -1.08)) // side windows
  g.add(box(7.0, 0.4, 2.0, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.72, 0.5, 2.1, 1.05, 0.7))
  g.add(wheel(0.72, 0.5, -0.4, 0.7, 1.05)) // extra rear axle
  g.add(wheel(0.72, 0.5, -0.4, 0.7, -1.05))
  g.add(light(3.08, 1.1, 0.9), light(3.08, 1.1, -0.9)) // headlights, slightly proud
  // rear cluster low on the cargo
  const rx = -3.4, fx = 3.0
  g.add(housingBar(2.3, 0.52, rx, 0.98, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 0.98, 0.55, -1), lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 0.98, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 0.98, 0.98, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 0.98, -0.98, -1))
  // front indicators + mirrors on the cab
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.22, fx, 0.75, 0.98, 1), lens(TURN_LEFT_MAT, 0.22, 0.22, fx, 0.75, -0.98, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.8, 1.05, 1.11), repeater(TURN_LEFT_MAT, 1.8, 1.05, -1.11))
  g.add(mirror(2.4, 1.5, 1.05, 1), mirror(2.4, 1.5, -1.05, -1))
  return g
}

/** City bus: long box with a window band. */
export function buildBus(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(9, 2.4, 2.5, 0xf1a208, 0, 1.75, 0)) // body (x ∈ [-4.5, 4.5])
  g.add(glass(8.4, 0.62, 2.54, 0, 2.35, 0)) // window band
  g.add(glass(0.07, 0.7, 2.3, 4.51, 2.3, 0), glass(0.07, 0.7, 2.3, -4.51, 2.3, 0)) // windscreen + rear
  g.add(box(9, 0.3, 2.3, 0x2a3440, 0, 0.55, 0)) // chassis
  g.add(...fourWheels(0.62, 0.42, 3.3, 1.2, 0.62))
  g.add(wheel(0.62, 0.42, 1.4, 0.62, 1.2), wheel(0.62, 0.42, 1.4, 0.62, -1.2)) // mid axle
  g.add(light(4.58, 0.95, 0.9), light(4.58, 0.95, -0.9))
  const rx = -4.5, fx = 4.5
  g.add(housingBar(2.3, 0.5, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.34, rx, 1.0, 0.6, -1), lens(REAR_LIGHT_MAT, 0.5, 0.34, rx, 1.0, -0.6, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 1.0, 1.05, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 1.0, -1.05, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.24, 0.22, fx, 0.7, 1.05, 1), lens(TURN_LEFT_MAT, 0.24, 0.22, fx, 0.7, -1.05, 1))
  g.add(repeater(TURN_RIGHT_MAT, 3.0, 1.1, 1.26), repeater(TURN_LEFT_MAT, 3.0, 1.1, -1.26))
  g.add(mirror(4.1, 1.9, 1.25, 1), mirror(4.1, 1.9, -1.25, -1))
  return g
}

/** Articulated lorry: cab plus a long trailer. */
export function buildLorry(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(8.2, 2.7, 2.5, 0xecf0f1, -2.5, 2.15, 0)) // trailer (rear at x = -6.6)
  g.add(box(2.4, 2.2, 2.45, 0xc0392b, 2.5, 1.8, 0)) // cab (front at x = 3.7)
  g.add(glass(0.07, 0.8, 2.1, 3.71, 2.3, 0)) // windscreen
  g.add(glass(1.7, 0.6, 0.06, 2.4, 2.3, 1.23), glass(1.7, 0.6, 0.06, 2.4, 2.3, -1.23)) // side windows
  g.add(box(2.3, 0.5, 2.3, 0x2a3440, 2.5, 0.6, 0)) // cab chassis
  g.add(box(8.0, 0.3, 2.2, 0x2a3440, -2.5, 0.85, 0)) // trailer chassis
  g.add(box(0.5, 1.4, 2.2, 0x8e1b12, 1.35, 2.6, 0)) // cab-to-trailer fairing
  g.add(steers(wheel(0.65, 0.45, 3.0, 0.65, 1.15)), steers(wheel(0.65, 0.45, 3.0, 0.65, -1.15))) // steer axle
  g.add(wheel(0.65, 0.45, 1.5, 0.65, 1.15), wheel(0.65, 0.45, 1.5, 0.65, -1.15)) // drive axle
  for (const wx of [-4.2, -5.4]) g.add(wheel(0.65, 0.45, wx, 0.65, 1.15), wheel(0.65, 0.45, wx, 0.65, -1.15))
  g.add(light(3.78, 1.05, 0.95), light(3.78, 1.05, -0.95))
  const rx = -6.6, fx = 3.7
  g.add(housingBar(2.3, 0.52, rx, 1.15, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 1.15, 0.6, -1), lens(REAR_LIGHT_MAT, 0.5, 0.36, rx, 1.15, -0.6, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.28, 0.26, rx, 1.15, 1.02, -1), lens(TURN_LEFT_MAT, 0.28, 0.26, rx, 1.15, -1.02, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.22, fx, 0.8, 1.05, 1), lens(TURN_LEFT_MAT, 0.22, 0.22, fx, 0.8, -1.05, 1))
  g.add(repeater(TURN_RIGHT_MAT, 2.0, 1.2, 1.26), repeater(TURN_LEFT_MAT, 2.0, 1.2, -1.26))
  g.add(mirror(3.3, 2.1, 1.25, 1), mirror(3.3, 2.1, -1.25, -1))
  return g
}

/** A fuel tanker: cab up front, a fat cylinder on the frame behind it. */
export function buildTanker(): THREE.Group {
  const g = new THREE.Group()
  const cab = 0xc8433a
  g.add(box(1.9, 1.5, 2.3, cab, 2.5, 1.5, 0)) // cab
  g.add(glass(0.1, 0.6, 2.0, 3.42, 1.9, 0)) // windscreen
  g.add(box(5.6, 0.3, 2.1, 0x3a3a44, -0.6, 0.86, 0)) // chassis rail
  // the tank itself: a cylinder lying along x
  const tank = new THREE.CylinderGeometry(1.05, 1.05, 5.2, 16)
  tank.rotateZ(Math.PI / 2) // axis Y → X
  const tankMesh = new THREE.Mesh(tank, new THREE.MeshStandardMaterial({ color: 0xd9dde2, flatShading: true }))
  tankMesh.position.set(-0.6, 1.75, 0)
  g.add(tankMesh)
  g.add(box(0.12, 1.9, 1.9, 0xb0b6bd, 1.98, 1.75, 0)) // front end cap ring
  g.add(box(0.12, 1.9, 1.9, 0xb0b6bd, -3.2, 1.75, 0)) // rear end cap ring
  g.add(box(0.5, 0.28, 0.5, 0xffcf3a, -0.6, 2.86, 0)) // top hatch
  g.add(steers(wheel(0.55, 0.4, 2.5, 0.55, 1.1)), steers(wheel(0.55, 0.4, 2.5, 0.55, -1.1))) // steer axle
  g.add(wheel(0.55, 0.4, -1.6, 0.55, 1.1), wheel(0.55, 0.4, -1.6, 0.55, -1.1))
  g.add(wheel(0.55, 0.4, -2.8, 0.55, 1.1), wheel(0.55, 0.4, -2.8, 0.55, -1.1)) // bogie
  g.add(light(3.48, 1.0, 0.82), light(3.48, 1.0, -0.82))
  const rx = -3.4, fx = 3.48
  g.add(housingBar(1.9, 0.5, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.42, 0.26, rx, 1.0, 0.8, -1), lens(REAR_LIGHT_MAT, 0.42, 0.26, rx, 1.0, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.0, 0.5, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.0, -0.5, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, fx, 0.7, 0.98, 1), lens(TURN_LEFT_MAT, 0.2, 0.18, fx, 0.7, -0.98, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.7, 1.2, 1.06), repeater(TURN_LEFT_MAT, 1.7, 1.2, -1.06))
  g.add(mirror(3.3, 2.1, 1.16, 1), mirror(3.3, 2.1, -1.16, -1))
  return g
}
