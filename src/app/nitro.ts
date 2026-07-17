import * as THREE from 'three'
import { createPickups, type Pickups } from './pickups'

export type { Pickups as Nitro }
export { NEAR_MIN, NEAR_MAX, FAR, APART, APART_MIN } from './pickups'

/** A glowing NOS-style bottle used as a speed-boost pickup. */
function bottleMesh(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x39c6ff, emissive: 0x1e7fff, emissiveIntensity: 0.7, flatShading: true })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10), mat)
  body.position.y = 0.55
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 0.35, 10), mat)
  shoulder.position.y = 1.28
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 8), mat)
  neck.position.y = 1.55
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xffcf3a, flatShading: true }))
  cap.position.y = 1.72
  g.add(body, shoulder, neck, cap)
  return g
}

/** Speed-boost pickups scattered on the roads. */
export function createNitro(scene: THREE.Scene): Pickups {
  return createPickups(scene, bottleMesh)
}
