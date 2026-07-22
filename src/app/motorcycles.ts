import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { groundQuat } from '../terrain/slope'
import { buildRoadGraph, nextNode, roomToDrive, type RoadGraph } from '../world/roadGraph'
import type { Circle } from '../physics/collide'

/** A few bikes threading the city — nippier company for the traffic, not a pack. */
const COUNT = 5
/** A motorbike's solid radius — narrow and short, so one circle covers it. */
const MOTORCYCLE_R = 1.0
/**
 * Metres right of the centreline a bike keeps. Narrower than the cars' lane (see
 * traffic.ts) and much narrower than a bus's: a motorbike sits nearer the kerb
 * and filters closer to the line than either, so oncoming ones still pass clean.
 */
const LANE = 1.5
/** How fast a bike swings its nose round to the way it's driving, per second —
 *  the same eased turn the traffic uses, quicker than a car's for a light machine. */
const TURN_RATE = 6.5
/** Guard on the arc-length walk, so a knot of coincident nodes can't spin forever. */
const MAX_HOPS = 8
/** A bike is quicker than the traffic (cars run ~7..13) — it has the legs to overtake. */
const SPEED_MIN = 12
const SPEED_MAX = 18
/**
 * Lean. A bike banks into a bend instead of standing bolt upright through it,
 * which is what reads as a motorbike and not a narrow car. The bank is taken
 * from the eased heading gap (the same `d` that arcs the nose round): a sharp
 * junction opens a big gap and leans it hard, a straight leaves it plumb.
 * LEAN_GAIN turns that gap into a roll, MAX_LEAN caps it short of a lie-down, and
 * LEAN_RATE eases the roll in and out so it flows through the corner.
 */
const LEAN_GAIN = 1.1
const MAX_LEAN = 0.5
const LEAN_RATE = 7

/**
 * Bike liveries: bright single colours, deliberately unlike the street's greys
 * and silvers (see BODY_COLORS in traffic.ts) so a bike reads as a bike darting
 * through the cars, not a car that shrank.
 */
const FRAME_COLORS = [
  0xd0392b, // red
  0x1f6f8b, // teal
  0x2c6e49, // green
  0xd98a1f, // amber
  0x37516e, // navy
  0x161616, // matt black
]

/** Riders' leathers — a plain, dark-ish spread so the frame stays the eye-catch. */
const RIDER_COLORS = [0x2b2f36, 0x3a3f47, 0x4a2f2f, 0x2f3a4a, 0x3f3a2f]

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

export interface Motorcycles {
  update(dt: number, night: boolean): void
  /** One solid circle per bike, so the car can't drive through them. */
  obstacles(): Circle[]
  dispose(): void
}

interface Bike {
  at: number
  to: number
  s: number
  speed: number
  /** The heading actually drawn, eased toward the edge, so the bike arcs a
   *  junction instead of pivoting a right-angle on the spot. */
  yaw: number
  /** Consecutive U-turns: two running means it's stuck on a stub. */
  uturns: number
  /** The bank angle actually drawn, eased toward the turn's demand each frame. */
  lean: number
  group: THREE.Group
  /** The headlight, lit at night. */
  lampMat: THREE.MeshStandardMaterial
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

/**
 * One motorbike: two wheels on a low frame, a tank and seat, a hunched rider in
 * boxes, and a headlight up front that glows at night. Built pointing +x with
 * local +z its right and local y=0 the ground it stands on, the convention every
 * vehicle here shares (see groundQuat) — so a lean is a roll about that +x nose.
 *
 * Returns the group and the night-lit headlight material the update loop drives.
 */
function buildBike(color: number, riderColor: number): {
  group: THREE.Group
  lamp: THREE.MeshStandardMaterial
} {
  const g = new THREE.Group()
  const R = 0.35 // wheel radius: its centre sits at y=R and the tyre kisses y=0
  const WB = 0.75 // half the wheelbase — front axle at +WB, rear at -WB

  // Two wheels. A car's wheel trick: a cylinder laid on its side (axle along z)
  // so it stands as a disc and rolls along +x.
  for (const wx of [WB, -WB]) {
    const geo = new THREE.CylinderGeometry(R, R, 0.12, 12)
    geo.rotateX(Math.PI / 2)
    const w = new THREE.Mesh(geo, mat(0x15161a))
    w.position.set(wx, R, 0)
    g.add(w)
  }

  // The spine of the frame, tank and seat: a low slab from wheel to wheel, a
  // rounder tank over the middle, a seat pad behind it. One narrow width
  // throughout — a bike is barely wider than its tyres.
  const W = 0.3
  const spine = new THREE.Mesh(new THREE.BoxGeometry(WB * 2, 0.14, W * 0.7), mat(color))
  spine.position.y = R + 0.16
  g.add(spine)
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, W), mat(color))
  tank.position.set(0.12, R + 0.34, 0)
  g.add(tank)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, W * 0.9), mat(0x1b1b1e))
  seat.position.set(-0.35, R + 0.34, 0)
  g.add(seat)

  // Forks and a stub of handlebar up front, angled forward like a real front end.
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat(0x2a2d33))
  fork.position.set(WB, R + 0.28, 0)
  fork.rotation.z = 0.35
  g.add(fork)
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.42), mat(0x2a2d33))
  bars.position.set(WB - 0.05, R + 0.5, 0)
  g.add(bars)

  // The rider, hunched over the tank in a few boxes — legs astride the seat, a
  // torso leaning to the bars, a helmet. Not pedestrians.ts: this one only ever
  // sits and rides, so a walking rig would be dead weight.
  const rmat = mat(riderColor)
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, W * 1.2), rmat)
  legs.position.set(-0.28, R + 0.5, 0)
  g.add(legs)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, W * 1.1), rmat)
  torso.position.set(-0.12, R + 0.78, 0)
  torso.rotation.z = 0.45 // hunched forward toward the bars
  g.add(torso)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xe8ebee))
  helmet.position.set(0.06, R + 1.02, 0)
  g.add(helmet)

  // The headlight: dark by day, a warm glow at dusk. Marked so a bike knows its
  // own lamp when the light comes on, and so a test can find it.
  const lamp = new THREE.MeshStandardMaterial({ color: 0x5a5a48, emissive: 0xfff2c0, emissiveIntensity: 0 })
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.22), lamp)
  head.position.set(WB + 0.08, R + 0.42, 0)
  head.userData.bikeLamp = true
  g.add(head)

  return { group: g, lamp }
}

/**
 * Bot motorcycles working the OSM streets.
 *
 * A handful of bikes walk the road graph exactly like the background traffic (the
 * road-following math is lifted from traffic.ts), only quicker and nippier and
 * banking into the bends. They collide with nothing, including you — they're here
 * to busy up the streets. Deterministic given `rand`: the same city lays out the
 * same bikes every load.
 */
export function createMotorcycles(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  count = COUNT,
): Motorcycles {
  const group = new THREE.Group()
  scene.add(group)
  group.userData.neonMover = 'bot' // neon flips the bot motorcycles to wireframe like the traffic
  const graph: RoadGraph = buildRoadGraph(roads)
  const nodes = graph.nodes
  // A private stream for the wander, kept off `rand`, so the choices at each
  // junction stay the same whatever randomness the caller feeds the rest.
  const rng = makeRng(0x819b1ce)

  const bikes: Bike[] = []

  const spawn = (): Bike | null => {
    if (nodes.length < 2) return null
    // Never start one on a pocket it could only turn round on — a driveway, a
    // service loop — the same trap the traffic guards against with roomToDrive.
    let at = -1
    for (let i = 0; i < 60 && at < 0; i++) {
      const c = Math.floor(rand() * nodes.length)
      if (roomToDrive(graph, c)) at = c
    }
    if (at < 0) return null
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null

    // Start already facing along the first edge, or its first metres would slew.
    const A = nodes[at]
    const B = nodes[to]
    const yaw = Math.atan2(B.z - A.z, B.x - A.x)

    const built = buildBike(
      FRAME_COLORS[Math.floor(rand() * FRAME_COLORS.length)],
      RIDER_COLORS[Math.floor(rand() * RIDER_COLORS.length)],
    )
    built.group.userData.motorcycle = true
    group.add(built.group)

    return {
      at,
      to,
      s: 0,
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      yaw,
      uturns: 0,
      lean: 0,
      group: built.group,
      lampMat: built.lamp,
    }
  }

  for (let i = 0; i < count; i++) {
    const b = spawn()
    if (b) bikes.push(b)
  }

  const place = (b: Bike): Placed => {
    const A = nodes[b.at]
    const B = nodes[b.to]
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const f = Math.min(1, b.s / len)
    const angle = Math.atan2(B.z - A.z, B.x - A.x)
    // Keep right of the centreline, so it filters kerb-side and oncoming pass.
    return {
      x: A.x + (B.x - A.x) * f + Math.sin(angle) * LANE,
      z: A.z + (B.z - A.z) * f - Math.cos(angle) * LANE,
      angle,
    }
  }

  const pos = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const qLean = new THREE.Quaternion()
  const xAxis = new THREE.Vector3(1, 0, 0)

  return {
    obstacles() {
      return bikes.map((b) => ({ x: b.group.position.x, z: b.group.position.z, r: MOTORCYCLE_R }))
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const m = mesh.material
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
      })
      bikes.length = 0
    },
    update(dt, night) {
      for (const b of bikes) {
        // Drive. Walk by arc length, carrying the overshoot into the next edge,
        // exactly as the traffic does — hopping node to node instead would jitter
        // on a finely mapped street.
        b.s += b.speed * dt
        let hops = 0
        for (; hops < MAX_HOPS; hops++) {
          const A = nodes[b.at]
          const B = nodes[b.to]
          const len = Math.hypot(B.x - A.x, B.z - A.z)
          if (len <= 0.001) {
            b.at = b.to
            b.to = nextNode(graph, b.at, b.to, rng)
            b.s = 0
            continue
          }
          if (b.s < len) break
          b.s -= len
          const next = nextNode(graph, b.at, b.to, rng)
          // Twice back the way we came means we're trapped on a stub; turn the
          // bike round onto a fresh wander rather than letting it shuttle a stub.
          b.uturns = next === b.at ? b.uturns + 1 : 0
          b.at = b.to
          b.to = next
        }
        if (hops >= MAX_HOPS || b.uturns >= 2) {
          const A = nodes[b.at]
          b.to = nextNode(graph, -1, b.at, rng)
          b.uturns = 0
          b.s = 0
          b.yaw = Math.atan2(nodes[b.to].z - A.z, nodes[b.to].x - A.x)
        }

        const p = place(b)
        pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
        // Ease the drawn heading toward the edge so it arcs a junction; wrap the
        // delta to (-pi, pi] first, or a bike facing just past -pi takes the long
        // way round. The same gap drives the lean below.
        let d = p.angle - b.yaw
        d -= Math.round(d / (2 * Math.PI)) * (2 * Math.PI)
        b.yaw += d * (1 - Math.exp(-TURN_RATE * dt))
        // Bank into the turn: lean toward the demand `d`, capped and eased, so it
        // rolls in on the way into a bend and stands back up on the way out. A
        // positive `d` (turning toward local +z, its right) rolls the top the same
        // way, which is a lean into the corner.
        let target = d * LEAN_GAIN
        if (target > MAX_LEAN) target = MAX_LEAN
        else if (target < -MAX_LEAN) target = -MAX_LEAN
        b.lean += (target - b.lean) * (1 - Math.exp(-LEAN_RATE * dt))
        // Stood on the road's slope, then rolled about its own nose for the lean —
        // a pure yaw slid every vehicle down every hill dead level, the old bug.
        groundQuat(q, p.x, p.z, b.yaw, provider)
        qLean.setFromAxisAngle(xAxis, b.lean)
        q.multiply(qLean)
        b.group.position.copy(pos)
        b.group.quaternion.copy(q)

        b.lampMat.emissiveIntensity = night ? 2.2 : 0
      }
    },
  }
}
