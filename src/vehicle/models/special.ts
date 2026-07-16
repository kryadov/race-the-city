import * as THREE from 'three'
import {
  box, wheel, light, lens, glass, person, housingBar, repeater,
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

/** A mobile crane: cab, outriggers, and a fixed boom raked up over the nose. */
export function buildCrane(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xf2b33a // works yellow
  g.add(box(6.2, 0.7, 2.3, body, 0, 0.85, 0)) // carrier deck
  g.add(box(1.7, 1.4, 2.0, body, 2.1, 1.9, 0)) // cab
  g.add(glass(0.1, 0.7, 1.7, 2.98, 2.1, 0))
  g.add(box(1.8, 1.0, 1.9, 0x3a3a44, -0.9, 1.8, 0)) // slew housing
  // boom: raked up toward +x, built as three shortening segments
  const boom = new THREE.Group()
  boom.add(box(4.2, 0.45, 0.5, body, 2.1, 0, 0))
  boom.add(box(3.4, 0.36, 0.4, 0xd9dde2, 5.4, 0.02, 0))
  boom.add(box(2.6, 0.28, 0.3, body, 8.2, 0.04, 0))
  boom.position.set(-0.6, 2.4, 0)
  boom.rotation.z = 0.42 // rake up ~24°
  g.add(boom)
  g.add(box(0.3, 0.6, 0.3, 0x3a3a44, -2.6, 2.4, 0)) // counterweight
  g.add(box(0.5, 0.24, 0.5, 0x3a3a44, 2.2, 0.5, 1.35), box(0.5, 0.24, 0.5, 0x3a3a44, 2.2, 0.5, -1.35)) // outriggers
  g.add(box(0.5, 0.24, 0.5, 0x3a3a44, -2.2, 0.5, 1.35), box(0.5, 0.24, 0.5, 0x3a3a44, -2.2, 0.5, -1.35))
  g.add(wheel(0.6, 0.42, 2.2, 0.6, 1.05), wheel(0.6, 0.42, 2.2, 0.6, -1.05))
  g.add(wheel(0.6, 0.42, 0.4, 0.6, 1.05), wheel(0.6, 0.42, 0.4, 0.6, -1.05))
  g.add(wheel(0.6, 0.42, -2.2, 0.6, 1.05), wheel(0.6, 0.42, -2.2, 0.6, -1.05))
  g.add(light(3.06, 1.3, 0.8), light(3.06, 1.3, -0.8))
  const rx = -3.12
  g.add(housingBar(0.4, 1.8, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.34, 0.24, rx, 1.0, 0.7, -1), lens(REAR_LIGHT_MAT, 0.34, 0.24, rx, 1.0, -0.7, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.0, 0.35, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.0, -0.35, -1))
  g.add(repeater(TURN_RIGHT_MAT, 1.6, 1.1, 1.16), repeater(TURN_LEFT_MAT, 1.6, 1.1, -1.16))
  return g
}

/** A road roller: a wide steel drum at the front, rubber wheels behind. */
export function buildRoller(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xf2b33a
  g.add(box(2.6, 0.7, 1.5, body, -0.4, 1.15, 0)) // frame
  g.add(box(1.3, 0.9, 1.4, body, -1.0, 1.9, 0)) // operator platform
  g.add(box(0.1, 0.5, 1.2, 0x1c2733, -0.38, 2.1, 0)) // screen
  g.add(person(-1.0, 2.0, 0, false, true))
  // drum: a wide cylinder with its axle along z, tagged so it rolls
  const drumGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.7, 20)
  drumGeo.rotateX(Math.PI / 2)
  const drum = new THREE.Group()
  drum.add(new THREE.Mesh(drumGeo, new THREE.MeshStandardMaterial({ color: 0xb8bec6, flatShading: true })))
  drum.add(box(1.6, 0.1, 1.74, 0x8f959d, 0, 0, 0)) // stripe so the roll reads
  drum.position.set(1.2, 0.75, 0)
  drum.userData.wheelRadius = 0.75
  g.add(drum)
  g.add(box(0.3, 0.5, 1.8, 0x3a3a44, 0.5, 1.0, 0)) // drum yoke
  g.add(wheel(0.5, 0.5, -1.5, 0.5, 0.7), wheel(0.5, 0.5, -1.5, 0.5, -0.7))
  g.add(light(0.6, 1.3, 0.5), light(0.6, 1.3, -0.5))
  const rx = -1.72
  g.add(housingBar(0.3, 1.2, rx, 1.3, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.26, 0.22, rx, 1.3, 0.45, -1), lens(REAR_LIGHT_MAT, 0.26, 0.22, rx, 1.3, -0.45, -1))
  return g
}

/** A combine harvester: tall body, a wide toothed header out front. */
export function buildCombine(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2f7a3f // harvester green
  g.add(box(4.4, 1.5, 2.4, body, -0.4, 1.7, 0)) // body
  g.add(box(1.5, 1.2, 1.8, 0xdfe4e8, 1.5, 2.9, 0)) // cab up high
  g.add(glass(0.1, 0.8, 1.6, 2.22, 2.9, 0))
  g.add(box(1.2, 1.0, 1.4, body, -2.4, 2.6, 0)) // grain tank
  g.add(box(2.2, 0.24, 0.24, 0xd9dde2, -1.6, 3.3, 0.9)) // unloading auger
  // header: wide bar with teeth, low at the front
  g.add(box(0.7, 0.5, 3.6, 0xf2b33a, 2.5, 0.75, 0))
  for (let i = -3; i <= 3; i++) g.add(box(0.5, 0.1, 0.1, 0xb8bec6, 2.95, 0.75, i * 0.5))
  g.add(box(0.3, 0.9, 3.4, body, 2.1, 1.3, 0)) // header throat
  g.add(wheel(0.85, 0.55, 0.9, 0.85, 1.05), wheel(0.85, 0.55, 0.9, 0.85, -1.05)) // big drive wheels
  g.add(wheel(0.45, 0.3, -2.3, 0.45, 0.75), wheel(0.45, 0.3, -2.3, 0.45, -0.75)) // small steer wheels
  g.add(light(2.3, 3.3, 0.6), light(2.3, 3.3, -0.6))
  const rx = -2.62
  g.add(housingBar(0.4, 1.9, rx, 1.6, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.34, 0.26, rx, 1.6, 0.8, -1), lens(REAR_LIGHT_MAT, 0.34, 0.26, rx, 1.6, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.6, 0.4, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.6, -0.4, -1))
  return g
}

/** A walk-behind tiller: two wheels, handlebars, and a driver on foot behind. */
export function buildTiller(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xd94f2b
  g.add(box(0.8, 0.5, 0.6, body, 0.1, 0.62, 0)) // engine block
  g.add(box(0.3, 0.34, 0.34, 0x3a3a44, 0.55, 0.62, 0)) // exhaust/filter
  g.add(box(0.16, 0.3, 0.16, 0xb8bec6, 0.1, 0.95, 0)) // filler neck
  // handlebars raked back over the driver
  const bars = new THREE.Group()
  bars.add(box(1.5, 0.07, 0.07, 0x3a3a44, -0.6, 0, 0.28))
  bars.add(box(1.5, 0.07, 0.07, 0x3a3a44, -0.6, 0, -0.28))
  bars.add(box(0.08, 0.07, 0.62, 0x1c2733, -1.32, 0.06, 0)) // cross grip
  bars.position.set(0, 0.72, 0)
  bars.rotation.z = -0.3
  g.add(bars)
  g.add(wheel(0.32, 0.18, 0.1, 0.32, 0.42), wheel(0.32, 0.18, 0.1, 0.32, -0.42))
  g.add(box(0.4, 0.3, 0.5, 0x3a3a44, -0.5, 0.3, 0)) // tine guard
  g.add(person(-1.3, 1.0, 0, false, true)) // walking behind
  g.add(light(0.62, 0.85, 0))
  g.add(housingBar(0.2, 0.4, -0.52, 0.7, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.18, 0.3, -0.52, 0.7, 0, -1))
  return g
}
