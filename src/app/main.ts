import * as THREE from 'three'
import { buildGround } from '../world/ground'
import { buildBuildings } from '../world/buildings'
import type { Building } from '../geo/types'

const mount = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
mount.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000)
camera.position.set(0, 6, 12)
camera.lookAt(0, 0, 0)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))
const sun = new THREE.DirectionalLight(0xffffff, 1)
sun.position.set(50, 100, 50)
scene.add(sun)

// TEMPORARY visual harness (Task 8): fake sine-wave elevation provider so ground
// displacement is visible without network access. Replaced/expanded in later tasks.
const fake = { heightAt: (x: number, z: number) => Math.sin(x * 0.05) * 4 + Math.cos(z * 0.05) * 4 }
const ground = buildGround(fake, 200, 128)
scene.add(ground)
camera.position.set(0, 80, 160)
camera.lookAt(0, 0, 0)

// TEMPORARY visual harness (Task 9): demo building footprints extruded on top
// of the fake ground provider. Replaced/expanded in later tasks.
const demoBuildings: Building[] = [
  { footprint: [{ x: -20, z: -20 }, { x: 0, z: -20 }, { x: 0, z: 0 }, { x: -20, z: 0 }], height: 30 },
  { footprint: [{ x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 40 }, { x: 10, z: 40 }], height: 15 },
]
const { mesh: buildingsMesh } = buildBuildings(demoBuildings, fake)
scene.add(buildingsMesh)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera)
})
