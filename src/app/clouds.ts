import * as THREE from 'three'

/** Clouds in a clear sky, and in an overcast one. Both are built up front. */
const CLOUDS_CLEAR = 12
const CLOUDS_OVERCAST = 40
const PUFFS = 5
const SPREAD = 480 // horizontal scatter around the camera
const Y_MIN = 130
const Y_MAX = 175
const DRIFT = 1.5 // slow wind (m/s)

export interface Clouds {
  update(cam: THREE.Vector3, dt: number): void
  /**
   * How much cloud there is: 0 a clear day, 1 an overcast one.
   *
   * Rain out of a blue sky is the thing that gives weather away.
   */
  setCover(cover: number): void
  setEnabled(on: boolean): void
}

/**
 * Low-poly clouds high overhead, following the camera. One draw call.
 *
 * Every cloud an overcast sky could want is built at the start; a clear sky just
 * draws fewer of them. InstancedMesh.count does that for free — no rebuilding,
 * and no second draw call for the ones the weather brought in.
 */
export function createClouds(scene: THREE.Scene): Clouds {
  const n = CLOUDS_OVERCAST * PUFFS
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3f4f8, flatShading: true })
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, n)
  im.frustumCulled = false
  im.count = CLOUDS_CLEAR * PUFFS

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const rnd = (): number => Math.random() * 2 - 1
  let k = 0
  for (let c = 0; c < CLOUDS_OVERCAST; c++) {
    const cx = rnd() * SPREAD
    const cz = rnd() * SPREAD
    const cy = Y_MIN + Math.random() * (Y_MAX - Y_MIN)
    // The extra ones an overcast sky brings are bigger, and they come in lower:
    // an overcast sky is a low ceiling, not more fluff at the same height.
    const overcast = c >= CLOUDS_CLEAR
    const size = (overcast ? 18 : 12) + Math.random() * 10
    for (let p = 0; p < PUFFS; p++) {
      const s = size * (0.5 + Math.random() * 0.6)
      scl.set(s, s * 0.5, s)
      pos.set(cx + rnd() * size * 1.4, (overcast ? cy - 25 : cy) + rnd() * size * 0.25, cz + rnd() * size * 1.4)
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
    setCover(cover) {
      const c = Math.max(0, Math.min(1, cover))
      const clouds = Math.round(CLOUDS_CLEAR + (CLOUDS_OVERCAST - CLOUDS_CLEAR) * c)
      im.count = clouds * PUFFS
      // And grey them off: white fluff over a downpour reads as a mistake.
      mat.color.setRGB(0.95 - c * 0.35, 0.956 - c * 0.34, 0.973 - c * 0.33)
    },
    setEnabled(on) {
      group.visible = on
    },
  }
}
