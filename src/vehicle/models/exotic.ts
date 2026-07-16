import * as THREE from 'three'
import {
  box, wheel, steers, glass, light, lens, person, housingBar,
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
  g.add(steers(wheel(0.42, 0.16, 0.85, 0.42, 0)), wheel(0.42, 0.16, -0.8, 0.42, 0))
  g.add(light(1.0, 0.95, 0)) // headlight
  const rx = -0.95, fx = 0.95
  g.add(lens(REAR_LIGHT_MAT, 0.22, 0.12, rx, 0.88, 0, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.1, 0.1, rx, 0.88, 0.2, -1), lens(TURN_LEFT_MAT, 0.1, 0.1, rx, 0.88, -0.2, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.1, 0.1, fx, 1.1, 0.26, 1), lens(TURN_LEFT_MAT, 0.1, 0.1, fx, 1.1, -0.26, 1))
  g.add(person(-0.18, 0.98, 0, true, true))
  return g
}

/**
 * A tracked all-terrain vehicle. The tracks are static slabs; the road wheels
 * inside them are tagged so they spin and sell the motion.
 */
export function buildTracked(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x5c6b3f // olive
  g.add(box(3.6, 0.9, 1.7, body, 0, 1.25, 0)) // hull
  g.add(box(2.0, 0.7, 1.5, body, -0.3, 1.95, 0)) // cabin
  g.add(glass(0.1, 0.5, 1.3, 0.72, 2.0, 0))
  g.add(box(0.5, 0.3, 1.6, body, 1.9, 1.1, 0)) // sloped nose
  // track slabs down each side
  for (const z of [1.0, -1.0]) {
    g.add(box(4.0, 0.5, 0.42, 0x24242a, 0, 0.25, z)) // track run
    g.add(box(0.42, 0.42, 0.42, 0x24242a, 2.0, 0.42, z)) // front idler cover
    g.add(box(0.42, 0.42, 0.42, 0x24242a, -2.0, 0.42, z)) // rear sprocket cover
    // road wheels peeking out of the track — these spin
    for (const x of [1.2, 0, -1.2]) g.add(wheel(0.3, 0.3, x, 0.30, z))
  }
  g.add(light(2.18, 1.2, 0.6), light(2.18, 1.2, -0.6))
  const rx = -2.02
  g.add(housingBar(0.36, 1.4, rx, 1.4, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.3, 0.24, rx, 1.4, 0.55, -1), lens(REAR_LIGHT_MAT, 0.3, 0.24, rx, 1.4, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 1.4, 0.2, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 1.4, -0.2, -1))
  return g
}

/** A wheel-less aero car: a smooth hull over four glowing lift pods. */
export function buildHover(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2bb3c9 // cyan
  g.add(box(4.0, 0.42, 1.9, body, 0, 0.75, 0)) // hull pan
  g.add(box(2.6, 0.44, 1.7, body, -0.2, 1.16, 0)) // waist
  g.add(glass(0.1, 0.42, 1.5, 1.0, 1.5, 0)) // canopy front
  g.add(box(1.6, 0.4, 1.4, 0x1c2733, -0.5, 1.52, 0)) // canopy
  g.add(box(0.6, 0.24, 1.8, body, 2.05, 0.86, 0)) // nose
  g.add(box(0.4, 0.5, 0.16, body, -2.05, 1.2, 0.7)) // tail fins
  g.add(box(0.4, 0.5, 0.16, body, -2.05, 1.2, -0.7))
  // lift pods: glowing discs under each corner, in place of wheels
  const podMat = new THREE.MeshStandardMaterial({
    color: 0x0a2a33, emissive: 0x39c6ff, emissiveIntensity: 0.9, flatShading: true,
  })
  for (const [x, z] of [[1.4, 0.82], [1.4, -0.82], [-1.4, 0.82], [-1.4, -0.82]] as const) {
    const pod = new THREE.CylinderGeometry(0.42, 0.3, 0.28, 12)
    const m = new THREE.Mesh(pod, podMat)
    m.position.set(x, 0.42, z)
    g.add(m) // deliberately NOT tagged wheelRadius: nothing to roll
  }
  g.add(light(2.32, 0.9, 0.6), light(2.32, 0.9, -0.6))
  const rx = -2.05, fx = 2.32
  g.add(housingBar(0.3, 1.7, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 1.3, 0.3, rx, 1.0, 0, -1)) // one bar
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 0.72, 0.8, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 0.72, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.18, 0.16, fx, 0.7, 0.82, 1), lens(TURN_LEFT_MAT, 0.18, 0.16, fx, 0.7, -0.82, 1))
  return g
}
