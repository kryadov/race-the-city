import * as THREE from 'three'
import type { CarState } from '../vehicle/car'
import type { ElevationProvider } from '../terrain/provider'

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  carMesh: THREE.Object3D
  sun: THREE.DirectionalLight
  ambient: THREE.AmbientLight
  /** Follow-camera distance multiplier (1 = default; smaller = closer). */
  camDist: number
  /** Transient distance scale eased by gameplay (e.g. pulled in inside tunnels). */
  camDistScale: number
}

export const CAM_DIST_MIN = 0.4
export const CAM_DIST_MAX = 3
export const CAM_DIST_STEP = 0.15

export type Quality = 'low' | 'normal' | 'high'
export const QUALITIES: readonly Quality[] = ['low', 'normal', 'high']

/** Render scale — by far the biggest GPU cost, so it leads the quality tiers. */
function pixelRatioFor(q: Quality): number {
  const dpr = window.devicePixelRatio || 1
  if (q === 'low') return Math.min(dpr, 0.75)
  if (q === 'high') return Math.min(dpr, 2)
  return Math.min(dpr, 1.5)
}

/** Particle-count multiplier for the weather effects. */
export function densityFor(q: Quality): number {
  return q === 'low' ? 0.4 : q === 'high' ? 1 : 0.75
}

/**
 * Apply the quality tier to the renderer: resolution scale and shadows.
 * `shadowsWanted` is the user's shadow toggle — 'low' forces them off regardless.
 */
export function applyQuality(stage: Stage, q: Quality, shadowsWanted: boolean): void {
  stage.renderer.setPixelRatio(pixelRatioFor(q))
  const shadows = q !== 'low' && shadowsWanted
  stage.renderer.shadowMap.enabled = shadows
  stage.sun.castShadow = shadows
  const size = q === 'high' ? 2048 : 1024
  if (stage.sun.shadow.mapSize.x !== size) {
    stage.sun.shadow.mapSize.set(size, size)
    stage.sun.shadow.map?.dispose() // force a rebuild at the new size
    stage.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
  }
  stage.renderer.shadowMap.needsUpdate = true
}

export function createStage(mount: HTMLElement, quality: Quality = 'normal'): Stage {
  // Antialias can't change after construction, so it's fixed from the saved tier.
  const renderer = new THREE.WebGLRenderer({
    antialias: quality !== 'low',
    // Ask for the discrete GPU. Without this the browser is free to pick the
    // integrated one, which on a two-GPU machine it generally does — and that is
    // the difference between a smooth frame and a slideshow.
    powerPreference: 'high-performance',
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(pixelRatioFor(quality))
  renderer.shadowMap.enabled = quality !== 'low'
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fc4e8)
  scene.fog = new THREE.Fog(0x9fc4e8, 300, 900)

  const ambient = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(100, 200, 80)
  sun.castShadow = quality !== 'low'
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024)
  const sc = sun.shadow.camera
  sc.left = -90
  sc.right = 90
  sc.top = 90
  sc.bottom = -90
  sc.near = 1
  sc.far = 600
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 2000)

  const carMesh: THREE.Object3D = new THREE.Group() // populated by setVehicleMesh
  scene.add(carMesh)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, carMesh, sun, ambient, camDist: 1, camDistScale: 1 }
}

/** Swap the vehicle mesh, disposing the old one's geometry/materials. */
export function setVehicleMesh(stage: Stage, mesh: THREE.Object3D): void {
  stage.scene.remove(stage.carMesh)
  stage.carMesh.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
  })
  mesh.traverse((o) => {
    o.castShadow = true
  })
  stage.carMesh = mesh
  stage.scene.add(mesh)
}

const camPos = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const CAM_SMOOTH_K = 8 // higher = snappier; framerate-independent
// Minimum gap to keep between the chase camera and the ground directly beneath
// it. On a steep downhill the point behind the car sits lower than the terrain
// there, so the eased camera sinks below the surface and you see UNDER the map —
// the ground mesh's underside and buildings poking through. Clamping the camera
// to ground + this margin keeps the near plane (0.5m) clear of the surface even
// with the frustum tilted downhill; 2.5m is comfortably past that near distance
// without lifting the camera far enough to feel detached from the car.
const CAM_GROUND_CLEARANCE = 2.5

const nUp = new THREE.Vector3()
const nFwd = new THREE.Vector3()
const nRight = new THREE.Vector3()
const nFwd0 = new THREE.Vector3()
const basis = new THREE.Matrix4()

/** Roll applied about the model's forward axis (bikes bank into corners). */
const leanQuat = new THREE.Quaternion()
const FWD_AXIS = new THREE.Vector3(1, 0, 0)
const tumbleQuat = new THREE.Quaternion()
// The basis puts local +z along the car's right, so a rotation about it pitches
// the nose up and over — the forward flip a big launch throws (see car.ts tumble).
const RIGHT_AXIS = new THREE.Vector3(0, 0, 1)

/** How far a steered wheel turns at full lock, radians. */
const MAX_STEER_YAW = 0.5

// Helicopter rotor spin, radians/second. Fast enough to read as a whirl, slow
// enough to dodge the strobe a true ~40 rad/s would flicker into at 60fps; the tail
// rotor runs faster than the main, as a real one does.
const MAIN_ROTOR_RATE = 16
const TAIL_ROTOR_RATE = 34

export function syncCamera(
  stage: Stage,
  car: CarState,
  dt: number,
  provider: ElevationProvider,
  lean = 0,
  level = false,
  steer = 0,
  tumble = 0,
): void {
  stage.carMesh.position.set(car.x, car.y, car.z)

  // Orient to the terrain: build a basis from the surface normal + heading so
  // the car pitches on hills and banks on side-slopes.
  const e = 2
  const dHx = provider.heightAt(car.x + e, car.z) - provider.heightAt(car.x - e, car.z)
  const dHz = provider.heightAt(car.x, car.z + e) - provider.heightAt(car.x, car.z - e)
  // A hovering vehicle floats level; everything else pitches to the slope.
  if (level) nUp.set(0, 1, 0)
  else nUp.set(-dHx / (2 * e), 1, -dHz / (2 * e)).normalize()
  nFwd0.set(Math.cos(car.heading), 0, Math.sin(car.heading))
  nRight.crossVectors(nFwd0, nUp).normalize()
  nFwd.crossVectors(nUp, nRight).normalize()
  basis.makeBasis(nFwd, nUp, nRight)
  stage.carMesh.quaternion.setFromRotationMatrix(basis)
  // Bank into the corner: the basis puts local +x along forward, so a roll about
  // local +x tips the model's up-vector toward its right (+z).
  if (lean !== 0) stage.carMesh.quaternion.multiply(leanQuat.setFromAxisAngle(FWD_AXIS, lean))
  // Flip through a big jump: a pitch about the car's own right axis, on top of the
  // slope basis (which is held level while airborne, so the flip reads clean).
  if (tumble !== 0) stage.carMesh.quaternion.multiply(tumbleQuat.setFromAxisAngle(RIGHT_AXIS, tumble))

  // Spin wheels by rolling distance (forward speed / radius), and point the
  // steered ones where the driver is asking. Both live on the same group: the
  // yaw is set outright, the roll accumulates.
  const forward = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading)
  // Negated: a +y rotation swings the wheel's +x nose toward -z, but the model's
  // right is +z, so a right lock without this points the wheels left.
  const yaw = -steer * MAX_STEER_YAW
  stage.carMesh.traverse((o) => {
    const d = o.userData as { wheelRadius?: number; steers?: boolean; spinY?: boolean; spinZ?: boolean }
    if (d.wheelRadius) o.rotation.z -= (forward / d.wheelRadius) * dt
    if (d.steers) o.rotation.y = yaw
    // Helicopter rotors: a constant whirl, not tied to ground speed — the main
    // rotor about its vertical mast, the tail rotor in its own vertical plane.
    if (d.spinY) o.rotation.y += MAIN_ROTOR_RATE * dt
    if (d.spinZ) o.rotation.z += TAIL_ROTOR_RATE * dt
  })

  const d = stage.camDist * stage.camDistScale
  const back = 14 * d, up = 7 * d
  camPos.set(car.x - Math.cos(car.heading) * back, car.y + up, car.z - Math.sin(car.heading) * back)
  // Exponential smoothing: equal easing per real second regardless of frame rate.
  const t = 1 - Math.exp(-CAM_SMOOTH_K * dt)
  stage.camera.position.lerp(camPos, t)
  // Never let the eased camera drop below the terrain under it: on steep
  // downslopes the chase point sinks beneath the surface and we'd render the
  // map from below. Clamp the FINAL (post-smoothing) height, sampled at the
  // camera's own settled x/z, so the lerp can't undo it; x/z and the look-at
  // target below are left untouched, so the view direction never jerks.
  const groundUnderCam = provider.heightAt(stage.camera.position.x, stage.camera.position.z)
  stage.camera.position.y = Math.max(stage.camera.position.y, groundUnderCam + CAM_GROUND_CLEARANCE)
  camTarget.set(car.x, car.y + 1.5, car.z)
  stage.camera.lookAt(camTarget)
}
