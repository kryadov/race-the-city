import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { groundQuat } from '../terrain/slope'
import { buildRoadGraph, nextNode, roomToDrive, type RoadGraph } from '../world/roadGraph'
import type { Circle } from '../physics/collide'

/** A few riders threading the city — quiet company on the kerb side, not a peloton. */
const COUNT = 6
/** A cyclist's solid radius — small, so the car clips rather than wall-stops on one. */
const CYCLIST_R = 0.7
/** How often a rider is started on a cycle lane when the city has any (0..1). Most
 *  of the time, so the riders read as belonging to the lanes; the rest fall on any
 *  road so a city with few marked lanes still has cyclists dotted about. */
const CYCLEWAY_BIAS = 0.8
/** A cycleway road point must fall within this of a graph node to count it as a
 *  ridable cycle-lane node — so a lane that isn't part of the ridable graph doesn't
 *  drag the tag onto a far-off ordinary road. Metres, squared. */
const CYCLEWAY_SNAP2 = 25

/**
 * Graph node indices that lie on a cycle-lane road (`Road.cycleway` — a dedicated
 * cycleway or a road carrying a bike lane), so riders can be started on the lanes.
 * A cycleway point only counts a node it actually sits on (within CYCLEWAY_SNAP2),
 * so a lane missing from the ridable graph isn't mis-mapped onto a nearby street.
 * Pure over roads + graph, so it's tested without the renderer.
 */
export function cyclewayNodes(roads: Road[], graph: RoadGraph): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const r of roads) {
    if (!r.cycleway) continue
    for (const p of r.points) {
      const n = graph.nearest(p.x, p.z)
      if (n < 0 || seen.has(n)) continue
      const node = graph.nodes[n]
      if ((node.x - p.x) ** 2 + (node.z - p.z) ** 2 > CYCLEWAY_SNAP2) continue
      seen.add(n)
      out.push(n)
    }
  }
  return out
}
/**
 * Metres right of the centreline a rider keeps. Wider than the motorbike's lane
 * (see motorcycles.ts) and much wider than a car's: a cyclist hugs the kerb in a
 * bike-lane feel, well right of the traffic filtering past on its inside.
 */
const LANE = 2.6
/** How fast a rider swings its nose round to the way it's going, per second — the
 *  same eased turn the other bots use, a touch lazier for an unhurried machine. */
const TURN_RATE = 5
/** Guard on the arc-length walk, so a knot of coincident nodes can't spin forever. */
const MAX_HOPS = 8
/**
 * A bike is slower than everything else on the road: the traffic runs ~7..13 and
 * the motorbikes 12..18, a rider pushes along at a human 3..6. Anything asserting
 * a speed can lean on a cyclist coming in under a car's floor.
 */
const SPEED_MIN = 3.5
const SPEED_MAX = 6
/**
 * Lean. A rider tips gently into a bend rather than the hard bank of a motorbike —
 * a bicycle is upright and unhurried, so the roll is small. Taken from the eased
 * heading gap (the same `d` that arcs the nose round): a sharp junction opens a
 * big gap and tips it a little, a straight leaves it plumb. LEAN_GAIN turns the
 * gap into a roll, MAX_LEAN caps it well short of the motorbike's, and LEAN_RATE
 * eases the roll in and out so it flows through the corner.
 */
const LEAN_GAIN = 0.6
const MAX_LEAN = 0.28
const LEAN_RATE = 6
/**
 * Pedalling cadence: radians the crank turns per metre rolled. Tied to distance,
 * not time, so the legs slow with the rider and stop when it stops — a wheel
 * radius of ~0.34 gives roughly a turn of the crank per turn of the wheel. The
 * legs swing off the same phase in counter-time, one down while the other lifts.
 */
const CADENCE = 2.6
/** How far the thighs swing off the pedal phase — a small, readable up-and-down. */
const LEG_SWING = 0.4

/**
 * Frame liveries: bright single colours, deliberately unlike the street's greys
 * (see BODY_COLORS in traffic.ts) so a bike reads as a bike ambling the kerb, not
 * a car that shrank.
 */
const FRAME_COLORS = [
  0xd0392b, // red
  0x2b9348, // green
  0xe09f3e, // amber
  0x277da1, // blue
  0x9d4edd, // purple
  0x161616, // matt black
]

/** Riders' kit — a plain, dark-ish spread so the frame stays the eye-catch. */
const RIDER_COLORS = [0x2b2f36, 0x3a3f47, 0x4a2f2f, 0x2f3a4a, 0x3f3a2f]

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

export interface Cyclists {
  update(dt: number, night: boolean): void
  /** One small solid circle per rider, so the car can't drive through them. */
  obstacles(): Circle[]
  dispose(): void
}

interface Rider {
  at: number
  to: number
  s: number
  speed: number
  /** The heading actually drawn, eased toward the edge, so the rider arcs a
   *  junction instead of pivoting a right-angle on the spot. */
  yaw: number
  /** Consecutive U-turns: two running means it's stuck on a stub. */
  uturns: number
  /** The bank angle actually drawn, eased toward the turn's demand each frame. */
  lean: number
  /** Crank angle, advanced by distance rolled — drives the pedals and the legs. */
  pedal: number
  group: THREE.Group
  /** The crank arm and pedals, spun about the bottom bracket. */
  crank: THREE.Group
  /** The two thighs, swung in counter-time so it reads as pedalling. */
  legL: THREE.Group
  legR: THREE.Group
  /** The rear reflector/lamp, lit at night. */
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
 * One bicycle: two thin wheels on a slim frame, handlebars up front, and a rider
 * astride the saddle with legs on the pedals. Built pointing +x with local +z its
 * right and local y=0 the ground it stands on, the convention every vehicle here
 * shares (see groundQuat) — so a lean is a roll about that +x nose.
 *
 * Returns the group, the crank and leg pivots the update loop pedals, and the
 * night-lit rear-lamp material it drives.
 */
function buildBike(color: number, riderColor: number): {
  group: THREE.Group
  crank: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  lamp: THREE.MeshStandardMaterial
} {
  const g = new THREE.Group()
  const R = 0.34 // wheel radius: its centre sits at y=R and the tyre kisses y=0
  const WB = 0.55 // half the wheelbase — front axle at +WB, rear at -WB

  // Two thin wheels. The car's wheel trick: a shallow cylinder laid on its side
  // (axle along z) so it stands as a disc and rolls along +x. Thin for a bike.
  for (const wx of [WB, -WB]) {
    const geo = new THREE.CylinderGeometry(R, R, 0.05, 14)
    geo.rotateX(Math.PI / 2)
    const w = new THREE.Mesh(geo, mat(0x15161a))
    w.position.set(wx, R, 0)
    g.add(w)
  }

  // The frame: a thin down tube from the rear wheel up to the head, a top tube to
  // the saddle, and the seat post. One narrow width throughout — a bike is barely
  // wider than its tyres.
  const frameMat = mat(color)
  const down = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), frameMat)
  down.position.set(0, R + 0.28, 0)
  down.rotation.z = 0.15
  g.add(down)
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), frameMat)
  top.position.set(-0.1, R + 0.5, 0)
  top.rotation.z = 0.1
  g.add(top)
  const seatPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), frameMat)
  seatPost.position.set(-0.42, R + 0.55, 0)
  g.add(seatPost)
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.14), mat(0x1b1b1e))
  saddle.position.set(-0.44, R + 0.7, 0)
  g.add(saddle)

  // Forks and handlebars up front, raked forward like a real front end.
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), mat(0x2a2d33))
  fork.position.set(WB, R + 0.25, 0)
  fork.rotation.z = 0.28
  g.add(fork)
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), mat(0x2a2d33))
  bars.position.set(WB - 0.02, R + 0.5, 0)
  g.add(bars)

  // The crank: a bottom-bracket spindle between the wheels with two stubby pedals
  // out on opposite arms. Spun about its z axis, the pedals wheel round; the legs
  // above track it. Its own pivot group sits at the bracket so a spin stays put.
  const crank = new THREE.Group()
  crank.position.set(-0.05, R - 0.05, 0)
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), mat(0x2a2d33))
    arm.position.set(0, side * 0.09, side * 0.09)
    crank.add(arm)
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), mat(0x101012))
    pedal.position.set(0, side * 0.16, side * 0.09)
    crank.add(pedal)
  }
  g.add(crank)

  // The rider: a torso leaning to the bars, a helmet, and two thighs on pivots at
  // the hips. Each thigh is a box hung below its pivot, so swinging the pivot on
  // the pedal phase lifts and drops the knee — cheap pedalling, no walk rig.
  const rmat = mat(riderColor)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.24), rmat)
  torso.position.set(-0.28, R + 0.86, 0)
  torso.rotation.z = 0.35 // hunched forward toward the bars
  g.add(torso)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xe8ebee))
  helmet.position.set(-0.08, R + 1.08, 0)
  g.add(helmet)

  const makeLeg = (sz: number): THREE.Group => {
    const leg = new THREE.Group()
    leg.position.set(-0.26, R + 0.58, sz * 0.11) // hip pivot
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), rmat)
    thigh.position.y = -0.2 // hung below the pivot so it swings from the hip
    leg.add(thigh)
    g.add(leg)
    return leg
  }
  const legL = makeLeg(1)
  const legR = makeLeg(-1)

  // The rear lamp/reflector: dark by day, a warm glow at dusk. Marked so a rider
  // knows its own lamp when the light comes on, and so a test can find it.
  const lamp = new THREE.MeshStandardMaterial({ color: 0x5a1a1a, emissive: 0xff3020, emissiveIntensity: 0 })
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), lamp)
  tail.position.set(-0.5, R + 0.5, 0)
  tail.userData.cyclistLamp = true
  g.add(tail)

  return { group: g, crank, legL, legR, lamp }
}

/**
 * Bot cyclists working the OSM streets.
 *
 * A handful of riders walk the road graph exactly like the background traffic (the
 * road-following math is lifted from traffic.ts / motorcycles.ts), only slower and
 * hugging the kerb side of the lane, tipping gently into the bends and pedalling as
 * they go. They collide with nothing, including you — they're here to busy up the
 * streets. Deterministic given `rand`: the same city lays out the same riders every
 * load.
 */
export function createCyclists(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  count = COUNT,
): Cyclists {
  const group = new THREE.Group()
  scene.add(group)
  group.userData.neonMover = 'bot' // neon flips the cyclists to wireframe like the traffic
  const graph: RoadGraph = buildRoadGraph(roads)
  const nodes = graph.nodes
  // A private stream for the wander, kept off `rand`, so the choices at each
  // junction stay the same whatever randomness the caller feeds the rest.
  const rng = makeRng(0x5c1de11)

  const riders: Rider[] = []
  // The cycle lanes to start riders on, when the city has any (see CYCLEWAY_BIAS).
  const cwNodes = cyclewayNodes(roads, graph)

  const spawn = (): Rider | null => {
    if (nodes.length < 2) return null
    // Never start one on a pocket it could only turn round on — a driveway, a
    // service loop — the same trap the traffic guards against with roomToDrive.
    // Prefer starting on a cycle lane where the city has them, else any road.
    let at = -1
    for (let i = 0; i < 60 && at < 0; i++) {
      const onLane = cwNodes.length > 0 && rand() < CYCLEWAY_BIAS
      const c = onLane ? cwNodes[Math.floor(rand() * cwNodes.length)] : Math.floor(rand() * nodes.length)
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
    built.group.userData.cyclist = true
    group.add(built.group)

    return {
      at,
      to,
      s: 0,
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      yaw,
      uturns: 0,
      lean: 0,
      pedal: rand() * Math.PI * 2, // start mid-stroke, each on its own phase
      group: built.group,
      crank: built.crank,
      legL: built.legL,
      legR: built.legR,
      lampMat: built.lamp,
    }
  }

  for (let i = 0; i < count; i++) {
    const r = spawn()
    if (r) riders.push(r)
  }

  const place = (r: Rider): Placed => {
    const A = nodes[r.at]
    const B = nodes[r.to]
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const f = Math.min(1, r.s / len)
    const angle = Math.atan2(B.z - A.z, B.x - A.x)
    // Keep well right of the centreline, kerb-side, so the traffic passes inside.
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
      return riders.map((r) => ({ x: r.group.position.x, z: r.group.position.z, r: CYCLIST_R }))
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const m = mesh.material
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
      })
      riders.length = 0
    },
    update(dt, night) {
      for (const r of riders) {
        // Drive. Walk by arc length, carrying the overshoot into the next edge,
        // exactly as the traffic does — hopping node to node instead would jitter
        // on a finely mapped street.
        const step = r.speed * dt
        r.s += step
        let hops = 0
        for (; hops < MAX_HOPS; hops++) {
          const A = nodes[r.at]
          const B = nodes[r.to]
          const len = Math.hypot(B.x - A.x, B.z - A.z)
          if (len <= 0.001) {
            r.at = r.to
            r.to = nextNode(graph, r.at, r.to, rng)
            r.s = 0
            continue
          }
          if (r.s < len) break
          r.s -= len
          const next = nextNode(graph, r.at, r.to, rng)
          // Twice back the way we came means we're trapped on a stub; turn the
          // rider round onto a fresh wander rather than letting it shuttle a stub.
          r.uturns = next === r.at ? r.uturns + 1 : 0
          r.at = r.to
          r.to = next
        }
        if (hops >= MAX_HOPS || r.uturns >= 2) {
          const A = nodes[r.at]
          r.to = nextNode(graph, -1, r.at, rng)
          r.uturns = 0
          r.s = 0
          r.yaw = Math.atan2(nodes[r.to].z - A.z, nodes[r.to].x - A.x)
        }

        const p = place(r)
        pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
        // Ease the drawn heading toward the edge so it arcs a junction; wrap the
        // delta to (-pi, pi] first, or a rider facing just past -pi takes the long
        // way round. The same gap drives the lean below.
        let d = p.angle - r.yaw
        d -= Math.round(d / (2 * Math.PI)) * (2 * Math.PI)
        r.yaw += d * (1 - Math.exp(-TURN_RATE * dt))
        // Tip into the turn: lean toward the demand `d`, capped and eased, so it
        // rolls in on the way into a bend and stands back up on the way out. A
        // positive `d` (turning toward local +z, its right) rolls the top the same
        // way, which is a lean into the corner.
        let target = d * LEAN_GAIN
        if (target > MAX_LEAN) target = MAX_LEAN
        else if (target < -MAX_LEAN) target = -MAX_LEAN
        r.lean += (target - r.lean) * (1 - Math.exp(-LEAN_RATE * dt))
        // Stood on the road's slope, then rolled about its own nose for the lean —
        // a pure yaw slid every vehicle down every hill dead level, the old bug.
        groundQuat(q, p.x, p.z, r.yaw, provider)
        qLean.setFromAxisAngle(xAxis, r.lean)
        q.multiply(qLean)
        r.group.position.copy(pos)
        r.group.quaternion.copy(q)

        // Pedal off distance rolled, so the legs keep pace with the ground and
        // freeze when the rider does. The crank spins; the thighs swing off the
        // same phase in counter-time, one lifting while the other drives down.
        r.pedal += step * CADENCE
        r.crank.rotation.z = r.pedal
        r.legL.rotation.z = Math.sin(r.pedal) * LEG_SWING
        r.legR.rotation.z = Math.sin(r.pedal + Math.PI) * LEG_SWING

        r.lampMat.emissiveIntensity = night ? 2.4 : 0
      }
    },
  }
}
