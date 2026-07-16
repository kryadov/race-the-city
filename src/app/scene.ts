import * as THREE from 'three'
import type { CarState } from '../vehicle/car'

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  carMesh: THREE.Object3D
  sun: THREE.DirectionalLight
  ambient: THREE.AmbientLight
  /** Follow-camera distance multiplier (1 = default; smaller = closer). */
  camDist: number
}

export const CAM_DIST_MIN = 0.4
export const CAM_DIST_MAX = 3
export const CAM_DIST_STEP = 0.15

export function createStage(mount: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fc4e8)
  scene.fog = new THREE.Fog(0x9fc4e8, 300, 900)

  const ambient = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(100, 200, 80)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 2000)

  const carMesh: THREE.Object3D = new THREE.Group() // populated by setVehicleMesh
  scene.add(carMesh)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, carMesh, sun, ambient, camDist: 1 }
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
  stage.carMesh = mesh
  stage.scene.add(mesh)
}

const camPos = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const CAM_SMOOTH_K = 8 // higher = snappier; framerate-independent

export function syncCamera(stage: Stage, car: CarState, dt: number): void {
  stage.carMesh.position.set(car.x, car.y, car.z)
  stage.carMesh.rotation.y = -car.heading // model faces +x at heading 0

  // Spin wheels by rolling distance (forward speed / radius).
  const forward = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading)
  stage.carMesh.traverse((o) => {
    const r = (o.userData as { wheelRadius?: number }).wheelRadius
    if (r) o.rotation.z -= (forward / r) * dt
  })

  const back = 14 * stage.camDist, up = 7 * stage.camDist
  camPos.set(car.x - Math.cos(car.heading) * back, car.y + up, car.z - Math.sin(car.heading) * back)
  // Exponential smoothing: equal easing per real second regardless of frame rate.
  const t = 1 - Math.exp(-CAM_SMOOTH_K * dt)
  stage.camera.position.lerp(camPos, t)
  camTarget.set(car.x, car.y + 1.5, car.z)
  stage.camera.lookAt(camTarget)
}
