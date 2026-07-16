import * as THREE from 'three'
import {
  box, fourWheels, light, lens, housingBar, glass, person, repeater, mirror,
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT,
} from './parts'

export function buildCar(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4, 0.8, 1.9, 0xe63946, 0, 0.65, 0)) // body (x ∈ [-2, 2])
  g.add(box(2.1, 0.7, 1.7, 0xb5303b, -0.15, 1.25, 0)) // cabin (x ∈ [-1.2, 0.9])
  // glass: windscreen, rear window, side windows
  g.add(glass(0.07, 0.48, 1.5, 0.91, 1.3, 0), glass(0.07, 0.48, 1.5, -1.21, 1.3, 0))
  g.add(glass(1.75, 0.44, 0.06, -0.15, 1.32, 0.86), glass(1.75, 0.44, 0.06, -0.15, 1.32, -0.86))
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

export function buildSports(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(4.3, 0.55, 2.0, 0x00b4d8, 0, 0.5, 0)) // low body (x ∈ [-2.15, 2.15])
  g.add(box(1.7, 0.45, 1.6, 0x0077b6, 0.1, 0.95, 0)) // low cabin (x ∈ [-0.75, 0.95])
  g.add(glass(0.06, 0.32, 1.4, 0.96, 0.97, 0), glass(0.06, 0.32, 1.4, -0.76, 0.97, 0))
  g.add(glass(1.45, 0.3, 0.06, 0.1, 0.98, 0.81), glass(1.45, 0.3, 0.06, 0.1, 0.98, -0.81))
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

/** Open-wheel race car with wings. */
export function buildRaceCar(): THREE.Group {
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

/** Convertible with a visible driver (no roof). */
export function buildCabrio(): THREE.Group {
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

/** A 60s cruiser: tall cabin, rounded wings, whitewall-ish fat wheels. */
export function buildRetro(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2f6f4f // deep green
  g.add(box(4.5, 0.5, 1.85, body, 0, 0.62, 0)) // low body pan
  g.add(box(2.9, 0.42, 1.8, body, -0.1, 1.0, 0)) // waist
  g.add(box(1.9, 0.6, 1.6, 0xdfe4e8, -0.25, 1.42, 0)) // tall greenhouse
  g.add(glass(0.1, 0.44, 1.45, 0.68, 1.42, 0)) // windscreen
  g.add(box(0.7, 0.3, 1.9, body, 1.95, 0.86, 0)) // rounded nose
  g.add(box(0.5, 0.28, 1.9, body, -2.05, 0.86, 0)) // boot
  g.add(...fourWheels(0.52, 0.42, 1.4, 0.95, 0.52))
  g.add(light(2.28, 0.9, 0.62), light(2.28, 0.9, -0.62))
  const rx = -2.28, fx = 2.28
  g.add(housingBar(0.4, 1.7, rx, 0.9, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.4, 0.28, rx, 0.9, 0.55, -1), lens(REAR_LIGHT_MAT, 0.4, 0.28, rx, 0.9, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 0.9, 0.85, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 0.9, -0.85, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.2, fx, 0.86, 0.86, 1), lens(TURN_LEFT_MAT, 0.2, 0.2, fx, 0.86, -0.86, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.35, 0.95, 0.94), repeater(TURN_LEFT_MAT, 1.35, 0.95, -0.94))
  g.add(mirror(0.85, 1.3, 0.94, 1), mirror(0.85, 1.3, -0.94, -1))
  return g
}

/** Electric: smooth one-box shape, no grille, a light bar across the nose. */
export function buildEv(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xe8eef2 // pearl white
  g.add(box(4.3, 0.62, 1.85, body, 0, 0.62, 0))
  g.add(box(3.1, 0.52, 1.78, body, -0.15, 1.16, 0)) // smooth cabin
  g.add(glass(0.1, 0.4, 1.6, 1.4, 1.2, 0)) // steep windscreen
  g.add(glass(0.1, 0.36, 1.6, -1.7, 1.2, 0)) // rear screen
  g.add(...fourWheels(0.46, 0.34, 1.42, 0.94, 0.46))
  // full-width light bar instead of separate headlights
  g.add(light(2.12, 0.82, 0.5), light(2.12, 0.82, 0), light(2.12, 0.82, -0.5))
  const rx = -2.12, fx = 2.12
  g.add(housingBar(0.26, 1.86, rx, 0.86, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 1.5, 0.26, rx, 0.86, 0, -1)) // single bar
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 0.6, 0.82, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 0.6, -0.82, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.18, 0.16, fx, 0.6, 0.84, 1), lens(TURN_LEFT_MAT, 0.18, 0.16, fx, 0.6, -0.84, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.3, 0.9, 0.94), repeater(TURN_LEFT_MAT, 1.3, 0.9, -0.94))
  g.add(mirror(0.8, 1.24, 0.94, 1), mirror(0.8, 1.24, -0.94, -1))
  return g
}

/** A people carrier: one tall box, sliding-door line, small wheels. */
export function buildMinivan(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x8f6fc0 // muted violet
  g.add(box(4.6, 0.66, 1.95, body, 0, 0.66, 0))
  g.add(box(3.9, 0.94, 1.9, body, -0.2, 1.44, 0)) // tall cabin
  g.add(glass(0.1, 0.6, 1.7, 1.72, 1.5, 0)) // big windscreen
  g.add(glass(0.08, 0.5, 1.7, -2.12, 1.5, 0)) // tailgate glass
  g.add(box(0.06, 0.7, 0.06, 0x3a3a44, 0.2, 1.4, 0.97)) // sliding-door rail, right
  g.add(box(0.06, 0.7, 0.06, 0x3a3a44, 0.2, 1.4, -0.97))
  g.add(...fourWheels(0.44, 0.36, 1.5, 0.98, 0.44))
  g.add(light(2.3, 0.82, 0.66), light(2.3, 0.82, -0.66))
  const rx = -2.32, fx = 2.3
  g.add(housingBar(0.8, 1.86, rx, 1.3, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.7, 0.24, rx, 1.3, 0.78, -1), lens(REAR_LIGHT_MAT, 0.7, 0.24, rx, 1.3, -0.78, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 0.86, 0.8, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 0.86, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, fx, 0.6, 0.88, 1), lens(TURN_LEFT_MAT, 0.2, 0.18, fx, 0.6, -0.88, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.45, 0.95, 0.99), repeater(TURN_LEFT_MAT, 1.45, 0.95, -0.99))
  g.add(mirror(1.5, 1.42, 0.99, 1), mirror(1.5, 1.42, -0.99, -1))
  return g
}
