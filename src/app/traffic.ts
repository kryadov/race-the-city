import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildRoadGraph, nextNode, roomToDrive, type RoadGraph } from '../world/roadGraph'
import type { Circle } from '../physics/collide'

/** Cars kept alive around the player. */
/** Cars at 'normal'. Few enough to drive through the streets, not thread a jam. */
const COUNT = 16
/**
 * Recycle and respawn distances. The scene's fog runs 300..900m, so both sit
 * beyond it: a car culled at 420m visibly winks out, and one spawned at 90m
 * appears out of thin air in front of you. Neither should ever be witnessed.
 */
const FAR = 940
const SPAWN_MIN = 620
const SPAWN_MAX = 900
const LANE = 2.2 // metres right of the centreline
/** Guard on the walk below, so a pile of coincident nodes can't spin forever. */
const MAX_HOPS = 8
/** How far up its own road a car looks for a train, in metres. */
const CROSSING_LOOK = 11

/**
 * What a street actually looks like: mostly white, silver, grey and black, with
 * the odd colour. A rank of primary-coloured cars reads as a toy box.
 */
const BODY_COLORS = [
  0xe8ebee, 0xe8ebee, 0xdcdfe3, // white / off-white
  0xa8aeb6, 0xa8aeb6, 0x8b9299, // silver, grey
  0x2b2e33, 0x2b2e33, 0x3c4249, // black, graphite
  0x8f1f24, // red
  0x1f3f7a, // navy
  0x2e5f4a, // dark green
  0x7a2f5e, // plum
  0xb8792a, // bronze
]

/**
 * Body types, as scales on the one shape. A separate mesh per type would be a
 * separate draw call per type; stretching the same box reads as a saloon, a
 * hatchback, a van or an estate from the road, which is all that's wanted.
 */
interface BodyType {
  body: [number, number, number]
  cabin: [number, number, number]
  /** Where the cabin sits along the car — a van's is over the nose. */
  cabinX: number
}

const BODY_TYPES: readonly BodyType[] = [
  { body: [1, 1, 1], cabin: [1, 1, 1], cabinX: -0.25 }, // saloon
  { body: [0.86, 1, 0.96], cabin: [0.8, 1.02, 0.96], cabinX: -0.1 }, // hatchback
  { body: [1.06, 1.3, 1.06], cabin: [1.55, 1.6, 1.0], cabinX: 0.15 }, // van
  { body: [1.08, 1.05, 1], cabin: [1.35, 1.08, 1], cabinX: -0.15 }, // estate
  { body: [1.02, 0.92, 1.02], cabin: [0.7, 0.95, 0.95], cabinX: 0.1 }, // pickup
]

export interface Traffic {
  /** @param blockers things the traffic must stop for — trains at a crossing */
  update(dt: number, camX: number, camZ: number, night: number, blockers?: Circle[]): void
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
  type: number
  /** Consecutive U-turns. Two in a row means it's trapped on a stub. */
  uturns: number
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
  count = COUNT,
): Traffic {
  const group = new THREE.Group()
  scene.add(group)
  const graph: RoadGraph = buildRoadGraph(roads)
  const rng = makeRng(0xc0ffee)
  const agents: Agent[] = []

  const spawn = (near: { x: number; z: number } | null): Agent | null => {
    if (graph.nodes.length < 2) return null
    // Never start one somewhere it cannot get anywhere from. A driveway or a
    // service loop behind a shop is a pocket: the car drives its length, turns
    // round, drives back and turns round again, forever. It was caught after the
    // fact — two U-turns and recycle — which still showed you the dance.
    let at = -1
    for (let i = 0; i < 40 && at < 0; i++) {
      const c = Math.floor(rand() * graph.nodes.length)
      if (near) {
        const d = Math.hypot(graph.nodes[c].x - near.x, graph.nodes[c].z - near.z)
        if (d <= SPAWN_MIN || d >= SPAWN_MAX) continue
      }
      if (roomToDrive(graph, c)) at = c
    }
    if (at < 0) return null // nowhere worth putting it; leave it be
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null
    return { at, to, s: 0, speed: 7 + rand() * 6, type: Math.floor(rand() * BODY_TYPES.length), uturns: 0 }
  }

  for (let i = 0; i < count; i++) {
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
  parts.cabin.translate(0, 1.5, 0)
  parts.glass.translate(0, 1.36, 0)
  parts.tail.translate(-2.06, 0.9, 0)
  parts.head.translate(2.06, 0.85, 0)

  /**
   * Instance colours only — NOT vertexColors.
   *
   * three's shader does `vColor *= color` under vertexColors, reading the
   * geometry's colour attribute. A BoxGeometry hasn't got one, so WebGL feeds it
   * zeroes and every car comes out black before instanceColor is ever applied —
   * which is exactly what happened. USE_INSTANCING_COLOR is defined on its own
   * the moment setColorAt is used, so this is all that's needed.
   */
  const bodyMesh = new THREE.InstancedMesh(parts.body, new THREE.MeshStandardMaterial({ flatShading: true }), n)
  const cabinMesh = new THREE.InstancedMesh(parts.cabin, new THREE.MeshStandardMaterial({ flatShading: true }), n)
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
  // Capacity is at least one, because an InstancedMesh of nothing is awkward to
  // build; what is DRAWN is the cars we actually have. Without this a city with
  // nowhere to put a car still renders one, from an untouched identity matrix,
  // parked at the origin — which is where you start.
  bodyMesh.count = agents.length
  cabinMesh.count = agents.length
  glassMesh.count = agents.length
  tailMesh.count = agents.length
  headMesh.count = agents.length
  wheelMesh.count = agents.length * 4
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
  const mPart = new THREE.Matrix4()
  const mw = new THREE.Matrix4()
  const off = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const scl = new THREE.Vector3()
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
    update(dt, camX, camZ, night, blockers) {
      solidAt.length = 0
      tailMat.emissiveIntensity = night * 1.6
      headMat.emissiveIntensity = night * 2.2
      for (let i = 0; i < agents.length; i++) {
        let a = agents[i]
        // Hold at a crossing rather than driving through the train: the traffic
        // has no physics, so nothing else would stop it.
        const here = place(a)
        const blocked = blockers?.some((b) => {
          const dx = b.x - here.x
          const dz = b.z - here.z
          const ahead = dx * Math.cos(here.angle) + dz * Math.sin(here.angle)
          if (ahead < -1 || ahead > CROSSING_LOOK) return false
          const lateral = -dx * Math.sin(here.angle) + dz * Math.cos(here.angle)
          return Math.abs(lateral) < b.r + 1.6
        })
        if (!blocked) a.s += a.speed * dt
        // Walk by arc length, carrying the overshoot into the next edge. The old
        // test — "within ARRIVE of the end" — fired on the very first frame for
        // any edge shorter than ARRIVE, and city blocks are full of vertices a
        // couple of metres apart. Cars hopped node to node instead of driving.
        let hops = 0
        for (; hops < MAX_HOPS; hops++) {
          const A = graph.nodes[a.at]
          const B = graph.nodes[a.to]
          const len = Math.hypot(B.x - A.x, B.z - A.z)
          if (len <= 0.001) {
            a.at = a.to
            a.to = nextNode(graph, a.at, a.to, rng)
            a.s = 0
            continue
          }
          if (a.s < len) break
          a.s -= len
          const next = nextNode(graph, a.at, a.to, rng)
          // Going back the way we came is a dead end turning us round. Once is a
          // cul-de-sac; twice running means we're trapped on a stub — a driveway,
          // or a fragment the graph left isolated — shuttling end to end and
          // flipping 180 degrees every couple of seconds. That reads as a twitch,
          // not as driving.
          a.uturns = next === a.at ? a.uturns + 1 : 0
          a.at = a.to
          a.to = next
        }
        if (hops >= MAX_HOPS || a.uturns >= 2) {
          const fresh = spawn({ x: camX, z: camZ })
          if (fresh) {
            agents[i] = fresh
            a = fresh
          } else {
            a.uturns = 0 // nowhere to move it to; let it be rather than thrash
          }
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
        const bt = BODY_TYPES[a.type]
        // Same boxes, stretched: a van, a hatchback and an estate out of one shape.
        scl.set(bt.body[0], bt.body[1], bt.body[2])
        mPart.compose(pos, q, scl)
        bodyMesh.setMatrixAt(i, mPart)
        scl.set(bt.cabin[0], bt.cabin[1], bt.cabin[2])
        off.makeTranslation(bt.cabinX, 0, 0)
        mPart.compose(pos, q, scl).multiply(off)
        cabinMesh.setMatrixAt(i, mPart)
        glassMesh.setMatrixAt(i, mPart)
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
