import * as THREE from 'three'

const CLOUDS = 12 // keep it sparse
const PUFFS = 5
const SPREAD = 480 // horizontal scatter around the camera
const Y_MIN = 130
const Y_MAX = 175
const DRIFT = 1.5 // slow wind (m/s)

export interface Clouds {
  update(cam: THREE.Vector3, dt: number): void
  setEnabled(on: boolean): void
}

/** A handful of low-poly clouds high overhead, following the camera. One draw call. */
export function createClouds(scene: THREE.Scene): Clouds {
  const n = CLOUDS * PUFFS
  const im = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xf3f4f8, flatShading: true }),
    n,
  )
  im.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const rnd = (): number => Math.random() * 2 - 1
  let k = 0
  for (let c = 0; c < CLOUDS; c++) {
    const cx = rnd() * SPREAD
    const cz = rnd() * SPREAD
    const cy = Y_MIN + Math.random() * (Y_MAX - Y_MIN)
    const size = 12 + Math.random() * 10
    for (let p = 0; p < PUFFS; p++) {
      const s = size * (0.5 + Math.random() * 0.6)
      scl.set(s, s * 0.5, s)
      pos.set(cx + rnd() * size * 1.4, cy + rnd() * size * 0.25, cz + rnd() * size * 1.4)
      im.setMatrixAt(k++, m.compose(pos, q, scl))
    }
  }
  im.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.add(im)
  scene.add(group)

  let drift = 0
  return {
    update(cam, dt) {
      drift = (drift + DRIFT * dt) % (SPREAD * 2)
      group.position.set(cam.x + drift - SPREAD, 0, cam.z)
    },
    setEnabled(on) {
      group.visible = on
    },
  }
}
