import * as THREE from 'three'
import type { CarState } from '../vehicle/car'

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  carMesh: THREE.Object3D
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(100, 200, 80)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 2000)

  const carMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.6, 2),
    new THREE.MeshStandardMaterial({ color: 0xe63946, flatShading: true }),
  )
  scene.add(carMesh)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, carMesh, camDist: 1 }
}

const camPos = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const CAM_SMOOTH_K = 8 // higher = snappier; framerate-independent

export function syncCamera(stage: Stage, car: CarState, dt: number): void {
  stage.carMesh.position.set(car.x, car.y + 0.8, car.z)
  stage.carMesh.rotation.y = -car.heading // box faces +x at heading 0

  const back = 14 * stage.camDist, up = 7 * stage.camDist
  camPos.set(car.x - Math.cos(car.heading) * back, car.y + up, car.z - Math.sin(car.heading) * back)
  // Exponential smoothing: equal easing per real second regardless of frame rate.
  const t = 1 - Math.exp(-CAM_SMOOTH_K * dt)
  stage.camera.position.lerp(camPos, t)
  camTarget.set(car.x, car.y + 1.5, car.z)
  stage.camera.lookAt(camTarget)
}
