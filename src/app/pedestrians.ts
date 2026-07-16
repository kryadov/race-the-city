import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'
import type { Circle } from '../physics/collide'

const COUNT = 22 // ambience, not a crowd to thread
/**
 * Recycled and respawned beyond the fog (300..900m), so you never see one
 * blink out or appear. They're small, but a figure vanishing at 260m is still a
 * figure vanishing.
 */
const FAR = 620
const SPAWN_MIN = 380
const SPAWN_MAX = 600
const KERB = 4.4 // metres off the centreline — the pavement, not the carriageway
const ARRIVE = 2
const SPEED_MIN = 1.1 // m/s: a walk
const SPEED_MAX = 1.8

const SHIRTS = [0xd0453f, 0x3a6ea5, 0x3f8f5e, 0xd8b23a, 0x8a4f9e, 0xdedad2, 0x39424d]

export interface Pedestrians {
  update(dt: number, camX: number, camZ: number): void
  /** Where they are, for the player to collide with. */
  obstacles(): Circle[]
  setEnabled(on: boolean): void
  dispose(): void
}

interface Walker {
  at: number
  to: number
  s: number
  speed: number
  side: number // which side of the way they walk
  phase: number // so they don't all bob in step
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * People walking the streets.
 *
 * They use the same road graph as the traffic, but walk the pavement — offset
 * from the centreline, on either side. Footways are included here and excluded
 * from the driving graph, which is exactly the difference between the two.
 *
 * They are ambience: no collision, no errands, and they walk through each other.
 */
export function createPedestrians(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): Pedestrians {
  const group = new THREE.Group()
  scene.add(group)
  // Footways included: this is where people belong and cars don't.
  const graph: RoadGraph = buildRoadGraph(roads.map((r) => (r.kind === 'path' ? { ...r, kind: 'service' as const } : r)))
  const rng = makeRng(0xbeef11)
  const walkers: Walker[] = []

  const spawn = (near: { x: number; z: number } | null): Walker | null => {
    if (!graph.nodes.length) return null
    let at = Math.floor(rand() * graph.nodes.length)
    if (near) {
      let found = false
      for (let i = 0; i < 40; i++) {
        const c = Math.floor(rand() * graph.nodes.length)
        const d = Math.hypot(graph.nodes[c].x - near.x, graph.nodes[c].z - near.z)
        if (d > SPAWN_MIN && d < SPAWN_MAX) {
          at = c
          found = true
          break
        }
      }
      if (!found) return null // nowhere out of sight; leave them where they are
    }
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null
    return {
      at,
      to,
      s: 0,
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      side: rand() < 0.5 ? 1 : -1,
      phase: rand() * Math.PI * 2,
    }
  }

  for (let i = 0; i < COUNT; i++) {
    const w = spawn(null)
    if (w) walkers.push(w)
  }

  // One instanced draw per part for everyone on the street.
  const torsoGeo = new THREE.BoxGeometry(0.4, 0.62, 0.26)
  torsoGeo.translate(0, 1.12, 0)
  const headGeo = new THREE.SphereGeometry(0.15, 6, 5)
  headGeo.translate(0, 1.58, 0)
  // Limbs pivot at the hip and shoulder, so the geometry hangs below its origin.
  const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.16)
  legGeo.translate(0, -0.4, 0)
  const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.13)
  armGeo.translate(0, -0.28, 0)

  const n = walkers.length || 1
  const bodies = new THREE.InstancedMesh(
    torsoGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    n,
  )
  const heads = new THREE.InstancedMesh(
    headGeo,
    new THREE.MeshStandardMaterial({ color: 0xe0ac69, flatShading: true }),
    n,
  )
  const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x33363d, flatShading: true }), n * 2)
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), n * 2)
  group.add(bodies, heads, legs, arms)
  // three computes an InstancedMesh's bounding sphere on first use and never
  // again, so once these drive away from it the whole batch gets frustum-culled
  // as one — they blink in and out depending on where you look. They are always
  // near the player anyway, so simply never cull them.
  group.children.forEach((c) => (c.frustumCulled = false))

  const col = new THREE.Color()
  walkers.forEach((_, i) => {
    col.setHex(SHIRTS[Math.floor(rand() * SHIRTS.length)])
    bodies.setColorAt(i, col)
    arms.setColorAt(i * 2, col) // sleeves match the shirt
    arms.setColorAt(i * 2 + 1, col)
  })
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true
  if (arms.instanceColor) arms.instanceColor.needsUpdate = true

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3(0, 0, 1) // limbs swing about the body's z
  const limbQ = new THREE.Quaternion()
  const mLimb = new THREE.Matrix4()
  const off = new THREE.Matrix4()
  const hip = new THREE.Vector3()
  let clock = 0

  const solidAt: Circle[] = []

  return {
    obstacles: () => solidAt,
    setEnabled(on) {
      group.visible = on
      if (!on) solidAt.length = 0
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
      })
      walkers.length = 0
      solidAt.length = 0
    },
    update(dt, camX, camZ) {
      clock += dt
      solidAt.length = 0
      walkers.forEach((w, i) => {
        const A = graph.nodes[w.at]
        const B = graph.nodes[w.to]
        const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
        w.s += w.speed * dt
        if (w.s >= len - ARRIVE) {
          const next = nextNode(graph, w.at, w.to, rng)
          w.at = w.to
          w.to = next
          w.s = 0
        }
        const f = Math.min(1, w.s / len)
        const angle = Math.atan2(B.z - A.z, B.x - A.x)
        const x = A.x + (B.x - A.x) * f + Math.sin(angle) * KERB * w.side
        const z = A.z + (B.z - A.z) * f - Math.cos(angle) * KERB * w.side

        if (Math.hypot(x - camX, z - camZ) > FAR) {
          const fresh = spawn({ x: camX, z: camZ })
          if (fresh) walkers[i] = fresh
        }

        solidAt.push({ x, z, r: 0.4 })
        // A gentle bob, out of step with the next person, so a crowd doesn't march.
        const stride = clock * w.speed * 4 + w.phase
        const bob = Math.sin(stride * 2) * 0.025
        pos.set(x, provider.heightAt(x, z) + bob, z)
        q.setFromAxisAngle(up, -angle)
        m.compose(pos, q, one)
        bodies.setMatrixAt(i, m)
        heads.setMatrixAt(i, m)

        // Legs and arms swing opposite each other, the way people walk.
        const swing = Math.sin(stride) * 0.5
        for (let k = 0; k < 2; k++) {
          const sign = k === 0 ? 1 : -1
          limbQ.setFromAxisAngle(right, swing * sign)
          off.compose(hip.set(0, 0.72, sign * 0.11), limbQ, one)
          mLimb.multiplyMatrices(m, off)
          legs.setMatrixAt(i * 2 + k, mLimb)

          limbQ.setFromAxisAngle(right, -swing * sign * 0.7)
          off.compose(hip.set(0, 1.42, sign * 0.26), limbQ, one)
          mLimb.multiplyMatrices(m, off)
          arms.setMatrixAt(i * 2 + k, mLimb)
        }
      })
      bodies.instanceMatrix.needsUpdate = true
      heads.instanceMatrix.needsUpdate = true
      legs.instanceMatrix.needsUpdate = true
      arms.instanceMatrix.needsUpdate = true
    },
  }
}
