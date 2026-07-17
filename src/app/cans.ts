import * as THREE from 'three'
import { createPickups, type Pickups } from './pickups'

/** Fewer than the nitro: fuel you trip over is not fuel you think about. */
const COUNT = 9

/**
 * A jerrycan: the flat-sided, X-braced, spout-on-a-corner sort.
 *
 * The braces and the spout are the whole reason it reads as a fuel can and not
 * as a red box, at the distance you actually see one from.
 */
function canMesh(): THREE.Group {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({
    color: 0xd8442e,
    emissive: 0x5a1408,
    emissiveIntensity: 0.5,
    flatShading: true,
    metalness: 0.3,
    roughness: 0.6,
  })
  const dark = new THREE.MeshStandardMaterial({ color: 0x8f2a1b, flatShading: true })

  const W = 0.72
  const H = 0.86
  const D = 0.3
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), steel)
  body.position.y = H / 2 + 0.06
  g.add(body)

  // The X pressed into each face.
  for (const side of [1, -1]) {
    for (const lean of [0.72, -0.72]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.07, 0.04), dark)
      brace.rotation.z = lean
      brace.position.set(0, H / 2 + 0.06, (side * D) / 2)
      g.add(brace)
    }
  }

  // Handle across the top, and the spout on one corner.
  const handle = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.07, 0.07), dark)
  handle.position.y = H + 0.12
  g.add(handle)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 6), dark)
  spout.position.set(W / 2 - 0.1, H + 0.14, 0)
  spout.rotation.z = 0.5
  g.add(spout)
  return g
}

/** Cans of petrol scattered on the roads, in the nitro's manner. */
export function createCans(scene: THREE.Scene): Pickups {
  return createPickups(scene, canMesh, COUNT)
}
