import * as THREE from 'three'
import { buildGround } from '../world/ground'

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera)
})
