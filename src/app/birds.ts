import * as THREE from 'three'

export interface Birds {
  update(dt: number, camX: number, camZ: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** A flock this size reads as birds; one bird crossing the sky reads as a bug. */
const COUNT = 8

/**
 * Cruising height, metres. Picked for the chase camera, not for realism: well
 * above the car and any rooftop, and well under the lowest aircraft (the
 * helicopter, at 70m — see aircraft.ts) so the two never share a layer of sky.
 */
const ALT_BASE = 32
const ALT_VARY = 6 // per-bird height offset, so the flock isn't a flat disc
const ALT_BOB = 2.5 // slow rise and fall, so a level flock doesn't look painted on

/** How far individual birds circle from the flock's own centre. */
const ORBIT_MIN = 10
const ORBIT_MAX = 26
const ORBIT_SPEED_MIN = 0.22 // rad/s
const ORBIT_SPEED_MAX = 0.42

/**
 * The flock's centre wanders its own slow circle — holding position would
 * look like a decal stuck on the sky — while chasing the camera, the way
 * traffic and pedestrians recycle around the camera rather than existing
 * city-wide. A bird flock two kilometres away is a flock nobody sees.
 */
const DRIFT_RADIUS = 55
const DRIFT_SPEED = 0.1 // rad/s
const FOLLOW_RATE = 1.2 // how eagerly the centre closes on the camera, per second
/** Hard cap on centre-to-camera distance, however far or fast the camera jumps. */
const LEASH_MAX = 110

const FLAP_SPEED_MIN = 7 // rad/s
const FLAP_SPEED_MAX = 11
const FLAP_AMPLITUDE = 0.85 // radians: a shallow shiver doesn't read as a flap

/** A muted flock palette: silhouettes against the sky, not parrots. */
const COLORS = [0x2a2a2c, 0x3a3632, 0x232526, 0x46403a]

/**
 * One triangle per wing, hinged at the shared root vertex (the body). Two of
 * these, instanced per bird and animated apart, is the cheapest shape that
 * still reads as a bird — a flat triangle is a glider, a hinge that opens and
 * closes is a wingbeat.
 *
 * Sized well past a real songbird, the way aircraft.ts oversizes airliners:
 * true-to-life, a bird a hundred metres up is a couple of pixels and may as
 * well not be there.
 */
function wingGeometry(mirror: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const tip: [number, number, number] = [-0.5, 0, mirror * 1.2]
  const trail: [number, number, number] = [-1.0, 0, mirror * 0.35]
  // Winding kept the same handedness on both the right wing and its mirror,
  // or the left wing's face normal would point into the ground.
  const verts = mirror > 0 ? [0, 0, 0, ...tip, ...trail] : [0, 0, 0, ...trail, ...tip]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * A handful of birds wheeling around a drifting centre near the player.
 *
 * They are not a simulation — no pathing, no collision — same as the aircraft
 * overhead: scenery a modest height up, close enough that a flap and a lazy
 * circle is all the behaviour that is ever seen.
 */
export function createBirds(scene: THREE.Scene, rand: () => number = Math.random, count = COUNT): Birds {
  const group = new THREE.Group()
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({
    flatShading: true,
    side: THREE.DoubleSide, // seen from below as often as from above
    // The sky dome and aircraft both skip the fog for the same reason (see
    // aircraft.ts): the fog runs 300..900m by distance from the camera, but
    // this is a thing hanging in clear air, not haze in front of it — a bird
    // out near the leash edge would otherwise wash out grey exactly when the
    // flock swings away from the player.
    fog: false,
  })
  const n = Math.max(1, count)
  const rightWing = new THREE.InstancedMesh(wingGeometry(1), mat, n)
  const leftWing = new THREE.InstancedMesh(wingGeometry(-1), mat, n)
  group.add(rightWing, leftWing)
  /**
   * Instance colours only — NOT vertexColors (see traffic.ts). Neither wing
   * geometry carries a colour attribute, so vertexColors would paint every
   * bird black before instanceColor is ever applied.
   */
  // The flock is always near the player and constantly moving, and three only
  // computes an InstancedMesh's bounding sphere once (see traffic.ts) — so
  // without this the whole flock gets frustum-culled as one the moment it
  // drifts from wherever that first sphere happened to land.
  rightWing.frustumCulled = false
  leftWing.frustumCulled = false

  interface Bird {
    orbitPhase: number
    orbitRadius: number
    orbitSpeed: number
    altOffset: number
    bobPhase: number
    bobSpeed: number
    flapPhase: number
    flapSpeed: number
  }

  const birds: Bird[] = []
  const col = new THREE.Color()
  for (let i = 0; i < n; i++) {
    birds.push({
      orbitPhase: rand() * Math.PI * 2,
      orbitRadius: ORBIT_MIN + rand() * (ORBIT_MAX - ORBIT_MIN),
      orbitSpeed: ORBIT_SPEED_MIN + rand() * (ORBIT_SPEED_MAX - ORBIT_SPEED_MIN),
      altOffset: (rand() - 0.5) * 2 * ALT_VARY,
      bobPhase: rand() * Math.PI * 2,
      bobSpeed: 0.5 + rand() * 0.5,
      flapPhase: rand() * Math.PI * 2,
      flapSpeed: FLAP_SPEED_MIN + rand() * (FLAP_SPEED_MAX - FLAP_SPEED_MIN),
    })
    col.setHex(COLORS[Math.floor(rand() * COLORS.length)])
    rightWing.setColorAt(i, col)
    leftWing.setColorAt(i, col)
  }
  if (rightWing.instanceColor) rightWing.instanceColor.needsUpdate = true
  if (leftWing.instanceColor) leftWing.instanceColor.needsUpdate = true

  let time = 0
  let driftAngle = rand() * Math.PI * 2
  let centerX = 0
  let centerZ = 0
  let started = false

  const m = new THREE.Matrix4()
  const qHeading = new THREE.Quaternion()
  const qFlap = new THREE.Quaternion()
  const qTotal = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      rightWing.geometry.dispose()
      leftWing.geometry.dispose()
      mat.dispose()
      birds.length = 0
    },
    update(dt, camX, camZ) {
      if (!started) {
        // Start on top of the player rather than easing in from wherever the
        // centre's zero value happened to be — otherwise the flock's first
        // sighting is it flying in from the map origin.
        centerX = camX
        centerZ = camZ
        started = true
      }
      time += dt
      driftAngle += DRIFT_SPEED * dt
      const targetX = camX + Math.cos(driftAngle) * DRIFT_RADIUS
      const targetZ = camZ + Math.sin(driftAngle) * DRIFT_RADIUS
      const closeFrac = Math.min(1, FOLLOW_RATE * dt)
      centerX += (targetX - centerX) * closeFrac
      centerZ += (targetZ - centerZ) * closeFrac
      // However fast or far the camera jumps (a city change teleports it),
      // the centre must never be left visibly behind — a hard leash on top of
      // the chase, not just a slower catch-up that could lose the race.
      const dx = centerX - camX
      const dz = centerZ - camZ
      const dist = Math.hypot(dx, dz)
      if (dist > LEASH_MAX) {
        const s = LEASH_MAX / dist
        centerX = camX + dx * s
        centerZ = camZ + dz * s
      }

      for (let i = 0; i < n; i++) {
        const b = birds[i]
        const angle = b.orbitPhase + time * b.orbitSpeed
        const bx = centerX + Math.cos(angle) * b.orbitRadius
        const bz = centerZ + Math.sin(angle) * b.orbitRadius
        const by = ALT_BASE + b.altOffset + Math.sin(time * b.bobSpeed + b.bobPhase) * ALT_BOB
        // Tangent to the orbit — the direction of travel — for heading.
        const vx = -Math.sin(angle) * b.orbitSpeed
        const vz = Math.cos(angle) * b.orbitSpeed
        const heading = Math.atan2(vz, vx)
        qHeading.setFromAxisAngle(yAxis, heading)
        const flap = Math.sin(time * b.flapSpeed + b.flapPhase) * FLAP_AMPLITUDE
        pos.set(bx, by, bz)

        // Flap first, in the wing's own local frame (the hinge), then orient
        // the whole bird by heading — the opposite order would swing the
        // wingtip through the ground on a bird flying north.
        qFlap.setFromAxisAngle(xAxis, flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, one)
        rightWing.setMatrixAt(i, m)

        // Mirrored sign, so both wings rise and fall together — a real
        // wingbeat is symmetric; matching signs would look like scissors.
        qFlap.setFromAxisAngle(xAxis, -flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, one)
        leftWing.setMatrixAt(i, m)
      }
      rightWing.instanceMatrix.needsUpdate = true
      leftWing.instanceMatrix.needsUpdate = true
    },
  }
}
