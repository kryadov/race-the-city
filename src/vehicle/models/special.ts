import * as THREE from 'three'
import {
  box, wheel, light, lens, glass,
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT,
} from './parts'

/** Farm tractor: big rear wheels, small front. */
export function buildTractor(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(2.4, 0.8, 1.2, 0x2e7d32, 0, 1.05, 0)) // body (x ∈ [-1.2, 1.2])
  g.add(box(1.0, 1.0, 1.15, 0x1b5e20, -0.5, 1.95, 0)) // cab (x ∈ [-1.0, 0.0])
  g.add(glass(0.06, 0.6, 0.95, 0.01, 2.0, 0), glass(0.06, 0.6, 0.95, -1.01, 2.0, 0)) // front/rear glass
  g.add(glass(0.85, 0.55, 0.06, -0.5, 2.0, 0.58), glass(0.85, 0.55, 0.06, -0.5, 2.0, -0.58)) // side glass
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
