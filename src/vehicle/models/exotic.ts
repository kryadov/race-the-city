import * as THREE from 'three'
import {
  box, wheel, light, lens, person,
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT,
} from './parts'

/** Motorbike with a visible rider. The render loop banks the whole model in corners. */
export function buildMotorbike(): THREE.Group {
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
