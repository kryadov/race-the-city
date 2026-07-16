import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const COUNT = 14 // bottles present at once
const PICK_R = 4 // pickup radius (m)
const RESPAWN = 10 // seconds before a collected bottle reappears elsewhere
const FLOAT_Y = 1.4 // hover height above the road

export interface Nitro {
  /** Scatter the pickups over a set of candidate points (road vertices). */
  setSpots(spots: Vec2[], provider: ElevationProvider): void
  /** Spin/bob the bottles and test pickup; returns true if one was collected. */
  update(carX: number, carZ: number, dt: number): boolean
  setEnabled(on: boolean): void
  reset(): void
}

interface Bottle {
  mesh: THREE.Group
  x: number
  z: number
  active: boolean
  respawn: number
}

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
export function createNitro(scene: THREE.Scene): Nitro {
  const group = new THREE.Group()
  scene.add(group)
  const bottles: Bottle[] = []
  for (let i = 0; i < COUNT; i++) {
    const mesh = bottleMesh()
    mesh.visible = false
    group.add(mesh)
    bottles.push({ mesh, x: 0, z: 0, active: false, respawn: 0 })
  }

  let spots: Vec2[] = []
  let provider: ElevationProvider | null = null
  let spin = 0
  let enabled = true

  const place = (b: Bottle): void => {
    if (!spots.length || !provider) {
      b.active = false
      b.mesh.visible = false
      return
    }
    const s = spots[Math.floor(Math.random() * spots.length)]
    b.x = s.x
    b.z = s.z
    b.mesh.position.set(s.x, provider.heightAt(s.x, s.z) + FLOAT_Y, s.z)
    b.active = true
    b.mesh.visible = true
  }

  return {
    setSpots(s, p) {
      spots = s
      provider = p
      for (const b of bottles) {
        b.respawn = 0
        place(b)
      }
    },
    update(carX, carZ, dt) {
      if (!enabled) return false
      spin += dt
      let picked = false
      for (const b of bottles) {
        if (b.active) {
          b.mesh.rotation.y = spin * 2
          b.mesh.position.y += Math.sin(spin * 3 + b.x) * 0.004 // gentle bob
          const dx = b.x - carX
          const dz = b.z - carZ
          if (dx * dx + dz * dz < PICK_R * PICK_R) {
            b.active = false
            b.mesh.visible = false
            b.respawn = RESPAWN
            picked = true
          }
        } else if (b.respawn > 0) {
          b.respawn -= dt
          if (b.respawn <= 0) place(b)
        }
      }
      return picked
    },
    setEnabled(on) {
      enabled = on
      group.visible = on
    },
    reset() {
      for (const b of bottles) {
        b.respawn = 0
        place(b)
      }
    },
  }
}
