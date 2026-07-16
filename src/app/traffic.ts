import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'

/** Cars kept alive around the player. */
const COUNT = 26
/** Beyond this they're recycled to somewhere ahead — no point simulating a city. */
const FAR = 420
const NEAR = 90 // don't pop one into existence in your mirror
const LANE = 2.2 // metres right of the centreline
const ARRIVE = 4

const BODY_COLORS = [0xb23b3b, 0x2f5fa8, 0xd8d8d0, 0x3c3c44, 0x2e7d5b, 0xc8a23a, 0x7a4a86]

export interface Traffic {
  update(dt: number, camX: number, camZ: number, night: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

interface Agent {
  from: number
  at: number
  to: number
  /** Distance travelled along the current edge. */
  s: number
  speed: number
  color: number
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
 * Background traffic.
 *
 * These are not cars in the physics sense: they walk the road graph at a steady
 * speed and never collide with anything, including you. They are there to make
 * the streets look inhabited, and a full simulation of a city's worth would cost
 * far more than it showed. Only a few dozen are kept, around the player, and
 * recycled ahead as you leave them behind.
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
    if (!graph.nodes.length) return null
    let at = Math.floor(rand() * graph.nodes.length)
    if (near) {
      // Try a few nodes and keep one at a sensible distance: in front of the
      // player, not on top of them.
      for (let i = 0; i < 24; i++) {
        const c = Math.floor(rand() * graph.nodes.length)
        const d = Math.hypot(graph.nodes[c].x - near.x, graph.nodes[c].z - near.z)
        if (d > NEAR && d < FAR) {
          at = c
          break
        }
      }
    }
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null
    return { from: at, at, to, s: 0, speed: 7 + rand() * 6, color: BODY_COLORS[Math.floor(rand() * BODY_COLORS.length)] }
  }

  for (let i = 0; i < COUNT; i++) {
    const a = spawn(null)
    if (a) agents.push(a)
  }

  // One instanced draw per part for every car on the map.
  const body = new THREE.BoxGeometry(4.1, 0.85, 1.8)
  body.translate(0, 0.85, 0)
  const cabin = new THREE.BoxGeometry(2.1, 0.7, 1.65)
  cabin.translate(-0.2, 1.6, 0)
  const lights = new THREE.BoxGeometry(0.1, 0.22, 1.5)
  lights.translate(-2.05, 0.9, 0)

  const bodyMesh = new THREE.InstancedMesh(
    body,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    agents.length || 1,
  )
  const cabinMesh = new THREE.InstancedMesh(
    cabin,
    new THREE.MeshStandardMaterial({ color: 0x24303c, flatShading: true }),
    agents.length || 1,
  )
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: 0xff2200, emissiveIntensity: 0 })
  const tailMesh = new THREE.InstancedMesh(lights, tailMat, agents.length || 1)
  group.add(bodyMesh, cabinMesh, tailMesh)

  const col = new THREE.Color()
  agents.forEach((a, i) => {
    col.setHex(a.color)
    bodyMesh.setColorAt(i, col)
  })
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)

  return {
    setEnabled(on) {
      group.visible = on
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
    },
    update(dt, camX, camZ, night) {
      tailMat.emissiveIntensity = night * 1.6
      agents.forEach((a, i) => {
        const A = graph.nodes[a.at]
        const B = graph.nodes[a.to]
        const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
        a.s += a.speed * dt
        if (a.s >= len - ARRIVE) {
          const next = nextNode(graph, a.at, a.to, rng)
          a.from = a.at
          a.at = a.to
          a.to = next
          a.s = 0
        }
        const f = Math.min(1, a.s / len)
        const angle = Math.atan2(B.z - A.z, B.x - A.x)
        // Keep right of the centreline, so oncoming cars pass rather than merge.
        const nx = Math.sin(angle) * LANE
        const nz = -Math.cos(angle) * LANE
        const x = A.x + (B.x - A.x) * f + nx
        const z = A.z + (B.z - A.z) * f + nz

        if (Math.hypot(x - camX, z - camZ) > FAR) {
          const fresh = spawn({ x: camX, z: camZ })
          if (fresh) agents[i] = fresh
        }

        pos.set(x, provider.heightAt(x, z), z)
        q.setFromAxisAngle(up, -angle)
        m.compose(pos, q, one)
        bodyMesh.setMatrixAt(i, m)
        cabinMesh.setMatrixAt(i, m)
        tailMesh.setMatrixAt(i, m)
      })
      bodyMesh.instanceMatrix.needsUpdate = true
      cabinMesh.instanceMatrix.needsUpdate = true
      tailMesh.instanceMatrix.needsUpdate = true
    },
  }
}
