import * as THREE from 'three'
import type { CarState } from '../vehicle/car'
import type { ElevationProvider } from '../terrain/provider'

const MARKS = 1000 // ring buffer of skid-mark quads (longer trail)
const PUFFS = 100 // smoke particle pool
const SKID_SLIP = 3.5 // lateral speed (m/s) to start marking
const MIN_SPEED = 4 // need some forward speed too
const REAR = 1.4 // rear axle offset behind centre
const TRACK = 0.9 // half wheel track
const MARK_OFFSET = 0.2 // above roads (0.15)

export interface DriftFx {
  update(car: CarState, dt: number, provider: ElevationProvider): void
  reset(): void
  setEnabled(on: boolean): void
}

/** Skid marks and drift smoke, both instanced (2 draw calls). */
export function createDriftFx(scene: THREE.Scene): DriftFx {
  const markGeo = new THREE.PlaneGeometry(0.5, 1.3)
  markGeo.rotateX(-Math.PI / 2)
  const marks = new THREE.InstancedMesh(
    markGeo,
    new THREE.MeshBasicMaterial({ color: 0x111114, transparent: true, opacity: 0.5, depthWrite: false }),
    MARKS,
  )
  marks.frustumCulled = false
  hideAll(marks)
  scene.add(marks)
  let markIdx = 0

  const puffs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.MeshBasicMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0.3, depthWrite: false }),
    PUFFS,
  )
  puffs.frustumCulled = false
  hideAll(puffs)
  scene.add(puffs)
  const px = new Float32Array(PUFFS)
  const py = new Float32Array(PUFFS)
  const pz = new Float32Array(PUFFS)
  const life = new Float32Array(PUFFS)
  const maxLife = new Float32Array(PUFFS)
  let puffIdx = 0
  let spawnAcc = 0

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)

  function placeMark(x: number, z: number, y: number, heading: number): void {
    q.setFromAxisAngle(UP, -heading)
    marks.setMatrixAt(markIdx, m.compose(pos.set(x, y, z), q, scl.set(1, 1, 1)))
    marks.instanceMatrix.needsUpdate = true
    markIdx = (markIdx + 1) % MARKS
  }

  function spawnPuff(x: number, z: number, y: number): void {
    const i = puffIdx
    puffIdx = (puffIdx + 1) % PUFFS
    px[i] = x
    py[i] = y + 0.4
    pz[i] = z
    maxLife[i] = 0.7
    life[i] = 0.7
  }

  let enabled = true
  const api: DriftFx = {
    update(car, dt, provider) {
      if (!enabled) return
      const fx = Math.cos(car.heading)
      const fz = Math.sin(car.heading)
      const forward = car.vx * fx + car.vz * fz
      const lateral = -car.vx * fz + car.vz * fx
      const rx = -fz
      const rz = fx
      const rcx = car.x - fx * REAR
      const rcz = car.z - fz * REAR

      if (Math.abs(lateral) > SKID_SLIP && Math.abs(forward) > MIN_SPEED) {
        for (const s of [TRACK, -TRACK]) {
          const wx = rcx + rx * s
          const wz = rcz + rz * s
          placeMark(wx, wz, provider.heightAt(wx, wz) + MARK_OFFSET, car.heading)
        }
        spawnAcc += dt
        while (spawnAcc > 0.03) {
          spawnAcc -= 0.03
          const wx = rcx + rx * (Math.random() * 2 - 1) * TRACK
          const wz = rcz + rz * (Math.random() * 2 - 1) * TRACK
          spawnPuff(wx, wz, provider.heightAt(wx, wz))
        }
      }

      let dirty = false
      for (let i = 0; i < PUFFS; i++) {
        if (life[i] <= 0) continue
        life[i] -= dt
        py[i] += 1.2 * dt // rise
        const l01 = Math.max(0, life[i] / maxLife[i])
        const s = (0.3 + (1 - l01) * 1.4) * Math.min(1, l01 / 0.25) // grow, then fade out
        if (life[i] <= 0) {
          scl.set(0, 0, 0)
          pos.set(0, -1000, 0)
        } else {
          scl.set(s, s, s)
          pos.set(px[i], py[i], pz[i])
        }
        puffs.setMatrixAt(i, m.compose(pos, q.identity(), scl))
        dirty = true
      }
      if (dirty) puffs.instanceMatrix.needsUpdate = true
    },

    reset() {
      hideAll(marks)
      marks.instanceMatrix.needsUpdate = true
      markIdx = 0
      for (let i = 0; i < PUFFS; i++) life[i] = 0
      hideAll(puffs)
      puffs.instanceMatrix.needsUpdate = true
    },
    setEnabled(on) {
      enabled = on
      if (!on) api.reset()
    },
  }
  return api
}

function hideAll(im: THREE.InstancedMesh): void {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < im.count; i++) im.setMatrixAt(i, zero)
}
