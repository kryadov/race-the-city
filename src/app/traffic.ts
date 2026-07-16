import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'
import type { Circle } from '../physics/collide'

/** Cars kept alive around the player. */
const COUNT = 16 // few enough to drive through the streets, not thread a jam
/**
 * Recycle and respawn distances. The scene's fog runs 300..900m, so both sit
 * beyond it: a car culled at 420m visibly winks out, and one spawned at 90m
 * appears out of thin air in front of you. Neither should ever be witnessed.
 */
const FAR = 940
const SPAWN_MIN = 620
const SPAWN_MAX = 900
const LANE = 2.2 // metres right of the centreline
const ARRIVE = 4

const BODY_COLORS = [0xb23b3b, 0x2f5fa8, 0xd8d8d0, 0x3c3c44, 0x2e7d5b, 0xc8a23a, 0x7a4a86, 0xe0e3e8]

export interface Traffic {
  update(dt: number, camX: number, camZ: number, night: number): void
  /** Where the cars are, for the player to collide with. */
  obstacles(): Circle[]
  setEnabled(on: boolean): void
  dispose(): void
}

interface Agent {
  at: number
  to: number
  s: number
  speed: number
}

interface Placed {
  x: number
  z: number
  angle: number
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

const solid = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

/**
 * Background traffic.
 *
 * These aren't cars in the physics sense: they walk the road graph at a steady
 * speed and collide with nothing, including you. They're here to make the
 * streets look inhabited, and simulating a city's worth would cost far more than
 * it showed. A few dozen are kept around the player and recycled beyond the fog,
 * so the density follows you and you never catch one arriving.
 */
export function createTraffic(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): Traffic {
  const group = new THREE.Group()
  scene.add(group)
  const graph: RoadGraph = buildRoadGraph(roads)
  const rng = makeRng(0xc0ffee)
  const agents: Agent[] = []

  const spawn = (near: { x: number; z: number } | null): Agent | null => {
    if (graph.nodes.length < 2) return null
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
      if (!found) return null // nowhere out of sight to put it; leave it be
    }
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null
    return { at, to, s: 0, speed: 7 + rand() * 6 }
  }

  for (let i = 0; i < COUNT; i++) {
    const a = spawn(null)
    if (a) agents.push(a)
  }
  const n = Math.max(1, agents.length)

  // One instanced draw per part, however many cars there are.
  const parts = {
    body: new THREE.BoxGeometry(4.1, 0.8, 1.82),
    cabin: new THREE.BoxGeometry(2.2, 0.66, 1.66),
    glass: new THREE.BoxGeometry(2.24, 0.42, 1.7),
    tail: new THREE.BoxGeometry(0.12, 0.2, 1.5),
    head: new THREE.BoxGeometry(0.12, 0.18, 1.4),
  }
  parts.body.translate(0, 0.78, 0)
  parts.cabin.translate(-0.25, 1.5, 0)
  parts.glass.translate(-0.25, 1.36, 0)
  parts.tail.translate(-2.06, 0.9, 0)
  parts.head.translate(2.06, 0.85, 0)

  const bodyMesh = new THREE.InstancedMesh(parts.body, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), n)
  const cabinMesh = new THREE.InstancedMesh(parts.cabin, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), n)
  const glassMesh = new THREE.InstancedMesh(parts.glass, solid(0x1e2a36), n)
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: 0xff2200, emissiveIntensity: 0 })
  const headMat = new THREE.MeshStandardMaterial({ color: 0x5a5a48, emissive: 0xfff2c0, emissiveIntensity: 0 })
  const tailMesh = new THREE.InstancedMesh(parts.tail, tailMat, n)
  const headMesh = new THREE.InstancedMesh(parts.head, headMat, n)

  // Wheels: four per car, so one mesh carries 4x the instances.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8)
  wheelGeo.rotateX(Math.PI / 2)
  const wheelMesh = new THREE.InstancedMesh(wheelGeo, solid(0x15161a), n * 4)
  const WHEELS: [number, number][] = [
    [1.35, 0.82],
    [1.35, -0.82],
    [-1.35, 0.82],
    [-1.35, -0.82],
  ]

  group.add(bodyMesh, cabinMesh, glassMesh, tailMesh, headMesh, wheelMesh)
  // three computes an InstancedMesh's bounding sphere on first use and never
  // again, so once these drive away from it the whole batch gets frustum-culled
  // as one — they blink in and out depending on where you look. They are always
  // near the player anyway, so simply never cull them.
  group.children.forEach((c) => (c.frustumCulled = false))

  const col = new THREE.Color()
  agents.forEach((_, i) => {
    col.setHex(BODY_COLORS[Math.floor(rand() * BODY_COLORS.length)])
    bodyMesh.setColorAt(i, col)
    cabinMesh.setColorAt(i, col)
  })
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true
  if (cabinMesh.instanceColor) cabinMesh.instanceColor.needsUpdate = true

  const m = new THREE.Matrix4()
  const mw = new THREE.Matrix4()
  const off = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)

  const place = (a: Agent): Placed => {
    const A = graph.nodes[a.at]
    const B = graph.nodes[a.to]
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const f = Math.min(1, a.s / len)
    const angle = Math.atan2(B.z - A.z, B.x - A.x)
    // Keep right of the centreline, so oncoming cars pass rather than merge.
    return {
      x: A.x + (B.x - A.x) * f + Math.sin(angle) * LANE,
      z: A.z + (B.z - A.z) * f - Math.cos(angle) * LANE,
      angle,
    }
  }

  const solidAt: Circle[] = []

  return {
    obstacles: () => solidAt,
    setEnabled(on) {
      group.visible = on
      if (!on) solidAt.length = 0 // switched off means not there to hit
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
      })
      agents.length = 0
      solidAt.length = 0
    },
    update(dt, camX, camZ, night) {
      solidAt.length = 0
      tailMat.emissiveIntensity = night * 1.6
      headMat.emissiveIntensity = night * 2.2
      for (let i = 0; i < agents.length; i++) {
        let a = agents[i]
        const A = graph.nodes[a.at]
        const B = graph.nodes[a.to]
        const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
        a.s += a.speed * dt
        if (a.s >= len - ARRIVE) {
          const next = nextNode(graph, a.at, a.to, rng)
          a.at = a.to
          a.to = next
          a.s = 0
        }

        let p = place(a)
        if (Math.hypot(p.x - camX, p.z - camZ) > FAR) {
          const fresh = spawn({ x: camX, z: camZ })
          if (fresh) {
            agents[i] = fresh
            a = fresh
            p = place(a) // place the new one now, or it renders a frame at the old spot
          }
        }

        solidAt.push({ x: p.x, z: p.z, r: 2.0 })
        pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
        q.setFromAxisAngle(up, -p.angle)
        m.compose(pos, q, one)
        bodyMesh.setMatrixAt(i, m)
        cabinMesh.setMatrixAt(i, m)
        glassMesh.setMatrixAt(i, m)
        tailMesh.setMatrixAt(i, m)
        headMesh.setMatrixAt(i, m)
        WHEELS.forEach(([wx, wz], k) => {
          off.makeTranslation(wx, 0.34, wz)
          mw.multiplyMatrices(m, off)
          wheelMesh.setMatrixAt(i * 4 + k, mw)
        })
      }
      bodyMesh.instanceMatrix.needsUpdate = true
      cabinMesh.instanceMatrix.needsUpdate = true
      glassMesh.instanceMatrix.needsUpdate = true
      tailMesh.instanceMatrix.needsUpdate = true
      headMesh.instanceMatrix.needsUpdate = true
      wheelMesh.instanceMatrix.needsUpdate = true
    },
  }
}
