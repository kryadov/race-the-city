import * as THREE from 'three'

/**
 * Gravity on a spark, m/s².
 *
 * Nearly the real figure, and deliberately not the car's: the car's is tuned for
 * arcade jumps, and a firework thrown up with it snapped back down like a stone.
 */
const G = 9
const LIFE = 2.2 // seconds a burst lasts before it is gone
const SPARKS = 40 // per burst
const SPEED_MIN = 9 // m/s the sparks leave the burst at
const SPEED_MAX = 16
const SIZE = 0.6
/**
 * Bursts alive at once. Finishing laps back to back can call `fire` faster than
 * they fade, and every burst is a geometry: without a cap they pile up.
 */
const MAX_BURSTS = 6

/** Bright enough to read against a daylit sky, and against a night one. */
const HUES = [0xffd23a, 0xff5a8a, 0x4ad9ff, 0x8cff5a, 0xff8c3a, 0xd06aff]

export interface Fireworks {
  /** Set one off at a point in the world. */
  fire(x: number, y: number, z: number): void
  update(dt: number): void
  dispose(): void
}

/** Where a spark thrown from `origin` at `v0` has got to after `t` seconds. */
export function sparkAt(
  t: number,
  v0: { x: number; y: number; z: number },
  origin: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: origin.x + v0.x * t,
    y: origin.y + v0.y * t - 0.5 * G * t * t,
    z: origin.z + v0.z * t,
  }
}

interface Burst {
  points: THREE.Points
  mat: THREE.PointsMaterial
  origin: { x: number; y: number; z: number }
  vel: { x: number; y: number; z: number }[]
  age: number
}

/** A velocity drawn uniformly over a sphere, so a burst is a ball and not a disc. */
function scatter(rand: () => number): { x: number; y: number; z: number } {
  const cos = rand() * 2 - 1
  const sin = Math.sqrt(1 - cos * cos)
  const th = rand() * Math.PI * 2
  const speed = SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN)
  return { x: sin * Math.cos(th) * speed, y: cos * speed, z: sin * Math.sin(th) * speed }
}

/**
 * Fireworks: bursts of ballistic sparks, for finishing a lap.
 *
 * Each burst is one `THREE.Points`, drawn additively with the fog off — the
 * chase camera looks out through 300-900m of fog, and a burst put behind it
 * came out as grey mush rather than as a firework.
 */
export function createFireworks(scene: THREE.Scene, rand: () => number = Math.random): Fireworks {
  const group = new THREE.Group()
  scene.add(group)
  let bursts: Burst[] = []

  const drop = (b: Burst): void => {
    group.remove(b.points)
    b.points.geometry.dispose()
    b.mat.dispose()
  }

  return {
    fire(x, y, z) {
      if (bursts.length >= MAX_BURSTS) drop(bursts.shift() as Burst)
      const origin = { x, y, z }
      const vel: { x: number; y: number; z: number }[] = []
      const pos = new Float32Array(SPARKS * 3)
      const col = new Float32Array(SPARKS * 3)
      // Two or three hues per burst, so it reads as one firework with a bit of
      // life in it rather than as confetti.
      const palette = [0, 1, 2].map(() => new THREE.Color(HUES[Math.floor(rand() * HUES.length)]))
      for (let i = 0; i < SPARKS; i++) {
        vel.push(scatter(rand))
        pos[i * 3] = x
        pos[i * 3 + 1] = y
        pos[i * 3 + 2] = z
        const c = palette[Math.floor(rand() * palette.length)]
        col[i * 3] = c.r
        col[i * 3 + 1] = c.g
        col[i * 3 + 2] = c.b
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const mat = new THREE.PointsMaterial({
        size: SIZE,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
      const points = new THREE.Points(geo, mat)
      group.add(points)
      bursts.push({ points, mat, origin, vel, age: 0 })
    },
    update(dt) {
      if (!bursts.length) return
      const live: Burst[] = []
      for (const b of bursts) {
        b.age += dt
        if (b.age >= LIFE) {
          drop(b)
          continue
        }
        const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute
        const arr = attr.array as Float32Array
        for (let i = 0; i < b.vel.length; i++) {
          const p = sparkAt(b.age, b.vel[i], b.origin)
          arr[i * 3] = p.x
          arr[i * 3 + 1] = p.y
          arr[i * 3 + 2] = p.z
        }
        attr.needsUpdate = true
        b.mat.opacity = 1 - b.age / LIFE
        live.push(b)
      }
      bursts = live
    },
    dispose() {
      for (const b of bursts) drop(b)
      bursts = []
      scene.remove(group)
    },
  }
}
