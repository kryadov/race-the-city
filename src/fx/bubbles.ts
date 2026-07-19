import * as THREE from 'three'

/**
 * Bubbles that rise off a car sunk under water, up to the surface where they pop.
 *
 * One instanced sphere per bubble, a small fixed pool reused for the life of the
 * game — no per-frame allocation, one draw call. While the car is submerged a few
 * are born each frame around it; each drifts up (wobbling, swelling a touch) to
 * the surface it was born under and is recycled there. When the car surfaces the
 * spawning stops, but the bubbles already in the water finish their climb rather
 * than winking out mid-water.
 */

/** How many bubbles can be in the water at once — the pool size, and a hard cap. */
export const BUBBLE_CAP = 96

/** How often a fresh batch is released while submerged, in seconds. */
const SPAWN_INTERVAL = 0.05
/** How many bubbles a batch tries to release (capped by free pool slots). */
const SPAWN_BATCH = 3
/** How fast a bubble climbs, m/s — a low end and a high end, drawn per bubble. */
const RISE_MIN = 1.8
const RISE_MAX = 3.2
/** A bubble's radius when born and the fraction it swells by on the way up. */
const R_MIN = 0.05
const R_MAX = 0.14
const SWELL = 0.5
/** How far a bubble sways off its rising column, metres, and how fast it sways. */
const WOBBLE_AMP = 0.14
const WOBBLE_FREQ = 6
/** How far out from the car centre a bubble may be born, metres (car half-width-ish). */
const SPREAD = 1.2
/** How far up from the car floor the birth points reach, metres (roughly its height). */
const BIRTH_RISE = 1.4

export interface Bubbles {
  /**
   * Advance the bubbles by `dt`. While `submerged`, new bubbles are born around
   * `car` and rise toward `surfaceY`; when it is false none are born but the live
   * ones keep rising. `surfaceY` is the water level the car is under.
   */
  update(dt: number, submerged: boolean, car: { x: number; y: number; z: number }, surfaceY: number): void
  dispose(): void
}

/** Semi-transparent bluish-white froth, its scale telling live bubbles from spent. */
export function createBubbles(scene: THREE.Scene, rand: () => number = Math.random): Bubbles {
  // A unit sphere; each instance's scale IS its radius. Low-poly — a bubble reads
  // as a pale blob under water, not as a faceted ball, so detail would be wasted.
  const geo = new THREE.SphereGeometry(1, 6, 4)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false, // froth shouldn't occlude what's behind it
  })
  const mesh = new THREE.InstancedMesh(geo, mat, BUBBLE_CAP)
  mesh.frustumCulled = false // the car (and so the bubbles) is always near the camera
  scene.add(mesh)

  // Per-bubble state, one flat array each — no objects, so nothing is allocated
  // per bubble or per frame. `alive` marks the slots in use; a dead slot sits at
  // scale 0, off-screen, until it is reused.
  const alive = new Uint8Array(BUBBLE_CAP)
  const bx = new Float32Array(BUBBLE_CAP) // rising column's x (wobble is added on top)
  const bz = new Float32Array(BUBBLE_CAP)
  const by = new Float32Array(BUBBLE_CAP) // current height
  const top = new Float32Array(BUBBLE_CAP) // the surface this bubble pops at
  const r0 = new Float32Array(BUBBLE_CAP) // birth radius
  const rise = new Float32Array(BUBBLE_CAP) // climb speed
  const phase = new Float32Array(BUBBLE_CAP) // wobble offset, so they don't sway in lockstep

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const q = new THREE.Quaternion() // always identity — a sphere needs no rotation
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < BUBBLE_CAP; i++) mesh.setMatrixAt(i, HIDDEN)
  mesh.instanceMatrix.needsUpdate = true

  let clock = 0 // drives the wobble; accumulated so it doesn't reset per bubble
  let spawnAcc = 0

  /** Wake one dead slot into a bubble at the car; a no-op if the pool is full. */
  function spawn(car: { x: number; y: number; z: number }, surfaceY: number): void {
    let i = -1
    for (let k = 0; k < BUBBLE_CAP; k++) {
      if (!alive[k]) {
        i = k
        break
      }
    }
    if (i < 0) return // pool full — the cap holds, oldest bubbles simply stay
    alive[i] = 1
    const a = rand() * Math.PI * 2
    const rad = rand() * SPREAD
    bx[i] = car.x + Math.cos(a) * rad
    bz[i] = car.z + Math.sin(a) * rad
    by[i] = car.y + rand() * BIRTH_RISE
    top[i] = surfaceY
    r0[i] = R_MIN + rand() * (R_MAX - R_MIN)
    rise[i] = RISE_MIN + rand() * (RISE_MAX - RISE_MIN)
    phase[i] = rand() * Math.PI * 2
  }

  return {
    update(dt, submerged, car, surfaceY) {
      clock += dt

      // Release bubbles only while under water, in fixed-size batches on a timer
      // so the rate doesn't ride on the frame rate.
      if (submerged) {
        spawnAcc += dt
        while (spawnAcc >= SPAWN_INTERVAL) {
          spawnAcc -= SPAWN_INTERVAL
          for (let b = 0; b < SPAWN_BATCH; b++) spawn(car, surfaceY)
        }
      } else {
        spawnAcc = 0 // don't bank spawn time across a stint out of the water
      }

      let dirty = false
      for (let i = 0; i < BUBBLE_CAP; i++) {
        if (!alive[i]) continue
        by[i] += rise[i] * dt
        if (by[i] >= top[i]) {
          // Reached the surface: pop. Free the slot and hide it.
          alive[i] = 0
          mesh.setMatrixAt(i, HIDDEN)
          dirty = true
          continue
        }
        // A gentle sway off the rising column, and a swell toward the surface: a
        // bubble grows a little as it climbs, then pops at the top.
        const wob = Math.sin(clock * WOBBLE_FREQ + phase[i]) * WOBBLE_AMP
        const grow = r0[i] * (1 + SWELL * (by[i] - (top[i] - BIRTH_RISE)) / BIRTH_RISE)
        const s = Math.max(r0[i], grow)
        pos.set(bx[i] + wob, by[i], bz[i] - wob)
        scl.set(s, s, s)
        mesh.setMatrixAt(i, m.compose(pos, q, scl))
        dirty = true
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true
    },

    dispose() {
      scene.remove(mesh)
      geo.dispose()
      mat.dispose()
    },
  }
}
