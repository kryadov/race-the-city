import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { groundQuat } from '../terrain/slope'
import { buildRoadGraph, nextNode, roomToDrive, type RoadGraph } from '../world/roadGraph'

/** A handful of buses for a whole city — a route or two you actually cross. */
const COUNT = 4
/**
 * Metres right of the centreline a bus keeps, so it pulls in on the kerb side
 * and oncoming buses pass rather than merge. A shade wider than the cars' lane
 * (see traffic.ts) because a bus is wider and hangs its flank further out.
 */
const LANE = 2.8
/** How fast a bus swings its nose round to the way it's driving, per second —
 *  the same eased turn the traffic uses, gentler for a long vehicle. */
const TURN_RATE = 4
/** Guard on the arc-length walk, so coincident nodes can't spin it forever. */
const MAX_HOPS = 8
/** A bus ambles: steady and unhurried, never a car's turn of speed. */
const SPEED_MIN = 8
const SPEED_MAX = 11
/** Within this of its stop, in metres, a bus pulls in and halts. */
const STOP_ARRIVE = 6
/** How far a bus must get from a stop it just served before it may halt again,
 *  in metres — or two stops a few metres apart would trap it, halting on the
 *  spot the instant it pulled away. */
const LEAVE_DIST = 24
/** Seconds a bus sits at a stop while the figures board and alight. */
const PAUSE_TIME = 4.5
/**
 * Seconds a bus will head for one stop before giving it up as unreachable and
 * picking another. Greedy routing can circle a stop it cannot actually get
 * within STOP_ARRIVE of — one stranded off the road network, say — and this is
 * what breaks the loop rather than letting it tour forever.
 */
const MAX_TRAVEL = 55
/** Little figures that gather at a stop while a bus is in. */
const FIGURES = 3

/**
 * Bus liveries: municipal single colours, deliberately unlike the street's
 * greys and silvers (see BODY_COLORS in traffic.ts) so a bus reads as a bus and
 * not an oversized car.
 */
const LIVERY = [
  0xc0392b, // red
  0x2c6e49, // green
  0x1f6f8b, // teal
  0xd98a1f, // amber
  0x37516e, // navy
]

/** The clothes on the little people at the stop — a plain enough spread. */
const FIG_COLORS = [0x3a6ea5, 0x8f4a4a, 0x4a6b4a, 0x6b5a7a, 0x555b62]

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

/** A shade of `c` darkened for a skirt band or a doorway. */
const darker = (c: number): number => new THREE.Color(c).multiplyScalar(0.68).getHex()

export interface Buses {
  update(dt: number, night: boolean): void
  dispose(): void
}

/** A stop, snapped to the road network it must be reached along. */
interface StopTarget {
  /** The kerb point the figures gather on. */
  stop: Vec2
  /** The road node the bus routes to and halts at. */
  node: number
  nx: number
  nz: number
}

interface Bus {
  at: number
  to: number
  s: number
  speed: number
  /** The heading actually drawn, eased toward the edge, so the bus arcs a
   *  junction instead of pivoting a right-angle on the spot. */
  yaw: number
  /** Consecutive U-turns: two running means it's stuck on a stub. */
  uturns: number
  state: 'driving' | 'paused'
  /** Seconds left at the stop. */
  pauseT: number
  /** Seconds spent heading for the current target, for the give-up above. */
  travel: number
  /** Index into `stopTargets`, or -1 when the city has no stops to serve. */
  target: number
  /** Where it last halted, so it clears LEAVE_DIST before halting again. */
  pausePos: { x: number; z: number }
  group: THREE.Group
  /** The window glass, lit as one at night. */
  glassMat: THREE.MeshStandardMaterial
  /** Head- and tail-lights, lit at night. */
  lampMat: THREE.MeshStandardMaterial
  /** The figures at the kerb, kept apart from the bus so they stay put while it
   *  edges in and pulls away. */
  platform: THREE.Group
  figs: THREE.Group[]
  /** Per figure: boarding (present, then shrinks away onto the bus) when true,
   *  alighting (grows in off the bus, then stays) when false. */
  roles: boolean[]
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
 * A row of separate windows down BOTH sides of the bus, merged into one
 * geometry — the trains' trick (see windowBand in trains.ts), so however many
 * panes a bus grows it stays a single mesh and a single draw. The gaps between
 * panes are left for the body colour to show through as pillars.
 */
function windowBand(span: number, y: number, half: number, winH: number): THREE.BufferGeometry {
  const pitch = 1.7 // one window plus its pillar, metres — a coach-window rhythm
  const n = Math.max(3, Math.round(span / pitch))
  const cell = span / n
  const winW = cell * 0.7
  const panes: THREE.BufferGeometry[] = []
  for (const z of [half, -half]) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(winW, winH, 0.05)
      g.translate(-span / 2 + cell * (i + 0.5), y, z)
      panes.push(g)
    }
  }
  return mergeGeometries(panes)
}

/**
 * One bus: a long box body in its livery, a paler roof, a skirt band, a row of
 * glazing each side, a windshield, two doors on the kerb side, lamps and six
 * wheels. Built pointing +x with local +z its right, the convention every
 * vehicle here is stood on (see groundQuat).
 *
 * Returns the group and the two night-lit materials the update loop drives.
 */
function buildBus(color: number): {
  group: THREE.Group
  glass: THREE.MeshStandardMaterial
  lamp: THREE.MeshStandardMaterial
} {
  const g = new THREE.Group()
  const L = 11 // a city single-decker, roughly to scale against the cars
  const H = 2.5
  const W = 2.5
  const CLEAR = 0.5 // underside height: local y=0 is the ground it stands on

  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), mat(color))
  body.position.y = CLEAR + H / 2
  g.add(body)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.25, W * 0.94), mat(0xe8ebee))
  roof.position.y = CLEAR + H + 0.05
  g.add(roof)
  // A darker skirt round the waist — a bus is never one flat colour top to sill.
  const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.995, 0.55, W * 1.005), mat(darker(color)))
  band.position.y = CLEAR + 0.55
  g.add(band)

  // Glazing: a row of panes each side plus the windshield, lit as one at night.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1b2b36,
    emissive: 0xffdf9a,
    emissiveIntensity: 0,
    flatShading: true,
  })
  const win = new THREE.Mesh(windowBand(L * 0.86, CLEAR + H * 0.62, W / 2 + 0.01, 0.95), glass)
  win.userData.busGlass = true
  g.add(win)
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, W * 0.86), glass)
  screen.position.set(L / 2 + 0.001, CLEAR + H * 0.62, 0)
  screen.userData.busGlass = true
  g.add(screen)

  // Two doors in the dark of the band, on the kerb (right) side — local -z, the
  // side the lane offset keeps toward the pavement.
  for (const dx of [L * 0.32, -L * 0.06]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.06), mat(0x2a2f36))
    door.position.set(dx, CLEAR + 0.95, -(W / 2) - 0.001)
    g.add(door)
  }

  // Head- and tail-lights, dark by day and lit at dusk.
  const lamp = new THREE.MeshStandardMaterial({ color: 0x5a5a48, emissive: 0xfff2c0, emissiveIntensity: 0 })
  for (const z of [0.8, -0.8]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.34), lamp)
    h.position.set(L / 2 + 0.05, CLEAR + 0.6, z)
    g.add(h)
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.3), lamp)
    t.position.set(-L / 2 - 0.05, CLEAR + 0.7, z)
    g.add(t)
  }

  // Six wheels — two up front, four on a rear bogie — each radius 0.5 so its
  // centre sits at y=0.5 and the tyre just kisses the ground.
  for (const [wx, wz] of [
    [L * 0.34, W / 2],
    [L * 0.34, -W / 2],
    [-L * 0.24, W / 2],
    [-L * 0.24, -W / 2],
    [-L * 0.34, W / 2],
    [-L * 0.34, -W / 2],
  ] as [number, number][]) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10)
    geo.rotateX(Math.PI / 2)
    const w = new THREE.Mesh(geo, mat(0x15161a))
    w.position.set(wx, 0.5, wz)
    g.add(w)
  }

  return { group: g, glass, lamp }
}

/** A blocky standing figure — torso and head, feet at local y=0. Cut from the
 *  same cloth as the rowboat's little rower, and deliberately NOT pedestrians.ts:
 *  these only ever stand and fade, so a walking rig would be dead weight. */
function buildFigure(color: number): THREE.Group {
  const f = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.6, 0.26), mat(color))
  torso.position.y = 0.55
  f.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), mat(0xe0ac69))
  head.position.y = 0.98
  f.add(head)
  return f
}

/**
 * The next node to drive to, heading for (tx, tz).
 *
 * Greedy: of the neighbours that aren't the way we came, take the one nearest
 * the target. Forbidding an immediate about-turn keeps it from dithering across
 * one junction; a genuine dead end (no other option) still turns it round, or a
 * bus would strand itself at the end of a road. It is not a shortest path — a
 * cul-de-sac can lure it in — but a bus touring roughly toward its stop reads
 * exactly right, and the give-up timer rescues the rare bus that gets no closer.
 */
function towardNode(graph: RoadGraph, from: number, at: number, tx: number, tz: number): number {
  const node = graph.nodes[at]
  if (!node || node.links.length === 0) return at
  const options = node.links.filter((n) => n !== from)
  if (options.length === 0) return from // dead end: turn around
  let best = options[0]
  let bestD = Infinity
  for (const opt of options) {
    const nd = graph.nodes[opt]
    const d = Math.hypot(nd.x - tx, nd.z - tz)
    if (d < bestD) {
      bestD = d
      best = opt
    }
  }
  return best
}

/**
 * Bot buses working the OSM streets and the bus stops on them.
 *
 * A few buses walk the road graph like the background traffic (the road-following
 * math is lifted from traffic.ts), but instead of wandering they each head for a
 * bus stop, pull in for a few seconds, and drive on to the next — and while one
 * is in, a knot of little figures at the kerb board (shrink away onto it) and
 * alight (grow in beside it), so it reads as a stop being worked. Deterministic
 * given `rand`: the same city lays out the same buses every load.
 */
export function createBuses(
  scene: THREE.Scene,
  roads: Road[],
  busStops: Vec2[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  count = COUNT,
): Buses {
  const group = new THREE.Group()
  scene.add(group)
  const graph: RoadGraph = buildRoadGraph(roads)
  const nodes = graph.nodes
  // A private stream for routing choices, kept off `rand`, so the wander of a
  // stopless city stays the same whatever randomness the caller feeds the rest.
  const rng = makeRng(0xb0554)

  // Every stop snapped to the nearest road node — the point the figures stand on
  // stays the raw kerb, but a bus can only be routed to somewhere on the network.
  const stopTargets: StopTarget[] = []
  if (nodes.length >= 2) {
    for (const s of busStops) {
      const n = graph.nearest(s.x, s.z)
      if (n < 0) continue
      stopTargets.push({ stop: s, node: n, nx: nodes[n].x, nz: nodes[n].z })
    }
  }

  const buses: Bus[] = []

  /** The stop nearest a point, that isn't `except`, chosen from the nearest few
   *  at random so a bus doesn't shuttle the same pair forever. */
  const pickTarget = (fromX: number, fromZ: number, except: number): number => {
    if (stopTargets.length === 0) return -1
    if (stopTargets.length === 1) return 0
    const ranked = stopTargets
      .map((t, i) => ({ i, d: Math.hypot(t.nx - fromX, t.nz - fromZ) }))
      .filter((o) => o.i !== except)
      .sort((p, q) => p.d - q.d)
    const pool = ranked.slice(0, Math.min(4, ranked.length))
    return pool[Math.floor(rng() * pool.length)].i
  }

  /** The next node a bus should drive to, given whether it has a stop to make. */
  const nextFrom = (b: Bus): number => {
    if (b.target >= 0) {
      const t = stopTargets[b.target]
      return towardNode(graph, b.at, b.to, t.nx, t.nz)
    }
    return nextNode(graph, b.at, b.to, rng)
  }

  const spawn = (): Bus | null => {
    if (nodes.length < 2) return null
    // Never start one on a pocket it could only turn round on — a driveway, a
    // service loop — the same trap the traffic guards against with roomToDrive.
    let at = -1
    for (let i = 0; i < 60 && at < 0; i++) {
      const c = Math.floor(rand() * nodes.length)
      if (roomToDrive(graph, c)) at = c
    }
    if (at < 0) return null

    // First stop: the nearest to where it starts, if the city has any.
    let target = -1
    if (stopTargets.length) {
      let bd = Infinity
      for (let i = 0; i < stopTargets.length; i++) {
        const d = Math.hypot(stopTargets[i].nx - nodes[at].x, stopTargets[i].nz - nodes[at].z)
        if (d < bd) {
          bd = d
          target = i
        }
      }
    }
    const to =
      target >= 0
        ? towardNode(graph, -1, at, stopTargets[target].nx, stopTargets[target].nz)
        : nextNode(graph, -1, at, rng)
    if (to === at) return null

    const A = nodes[at]
    const B = nodes[to]
    const yaw = Math.atan2(B.z - A.z, B.x - A.x)

    const built = buildBus(LIVERY[Math.floor(rand() * LIVERY.length)])
    built.group.userData.bus = true
    group.add(built.group)

    // The figures live in their own group, pinned to the kerb, so they hold
    // their ground while the bus noses in and pulls away beside them.
    const platform = new THREE.Group()
    platform.userData.platform = true
    group.add(platform)
    const figs: THREE.Group[] = []
    const roles: boolean[] = []
    for (let k = 0; k < FIGURES; k++) {
      const f = buildFigure(FIG_COLORS[Math.floor(rng() * FIG_COLORS.length)])
      f.position.x = (k - (FIGURES - 1) / 2) * 0.9 // strung along the kerb
      f.scale.setScalar(0) // nobody's there until a bus pulls in
      f.userData.figure = true
      platform.add(f)
      figs.push(f)
      roles.push(rng() < 0.5)
    }

    return {
      at,
      to,
      s: 0,
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      yaw,
      uturns: 0,
      state: 'driving',
      pauseT: 0,
      travel: 0,
      target,
      pausePos: { x: -1e9, z: -1e9 }, // nowhere: the first stop is free to make
      group: built.group,
      glassMat: built.glass,
      lampMat: built.lamp,
      platform,
      figs,
      roles,
    }
  }

  for (let i = 0; i < count; i++) {
    const b = spawn()
    if (b) buses.push(b)
  }

  const place = (b: Bus): Placed => {
    const A = nodes[b.at]
    const B = nodes[b.to]
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const f = Math.min(1, b.s / len)
    const angle = Math.atan2(B.z - A.z, B.x - A.x)
    // Keep right of the centreline, so it pulls in kerb-side and oncoming pass.
    return {
      x: A.x + (B.x - A.x) * f + Math.sin(angle) * LANE,
      z: A.z + (B.z - A.z) * f - Math.cos(angle) * LANE,
      angle,
    }
  }

  /** How visible a boarding figure is `pr` (0..1) of the way through the pause —
   *  in early, then shrinking away onto the bus by the end. */
  const boardCurve = (pr: number): number => {
    if (pr < 0.1) return pr / 0.1
    if (pr > 0.6) return Math.max(0, (0.8 - pr) / 0.2)
    return 1
  }
  /** An alighting figure: nothing, then it steps off and grows in to stay. */
  const alightCurve = (pr: number): number => {
    if (pr < 0.3) return 0
    if (pr < 0.5) return (pr - 0.3) / 0.2
    return 1
  }

  const pos = new THREE.Vector3()
  const q = new THREE.Quaternion()

  return {
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const m = mesh.material
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
      })
      buses.length = 0
    },
    update(dt, night) {
      for (const b of buses) {
        let p = place(b)

        if (b.state === 'paused') {
          b.pauseT -= dt
          if (b.pauseT <= 0) {
            // Time's up: note where we stood, pick the next stop, and roll.
            b.pausePos = { x: p.x, z: p.z }
            b.target = pickTarget(p.x, p.z, b.target)
            b.travel = 0
            b.state = 'driving'
          }
        } else {
          // Pull in once we're on top of the stop — but only after clearing the
          // last one, or two close stops would peg the bus between them.
          const t = b.target >= 0 ? stopTargets[b.target] : null
          const clearedLast = Math.hypot(p.x - b.pausePos.x, p.z - b.pausePos.z) > LEAVE_DIST
          if (t && clearedLast && Math.hypot(p.x - t.nx, p.z - t.nz) < STOP_ARRIVE) {
            b.state = 'paused'
            b.pauseT = PAUSE_TIME
            b.pausePos = { x: p.x, z: p.z }
          } else {
            // Drive. Walk by arc length, carrying the overshoot into the next
            // edge, exactly as the traffic does — hopping node to node instead
            // would jitter on a finely mapped street.
            b.travel += dt
            b.s += b.speed * dt
            let hops = 0
            for (; hops < MAX_HOPS; hops++) {
              const A = nodes[b.at]
              const B = nodes[b.to]
              const len = Math.hypot(B.x - A.x, B.z - A.z)
              if (len <= 0.001) {
                b.at = b.to
                b.to = nextFrom(b)
                b.s = 0
                continue
              }
              if (b.s < len) break
              b.s -= len
              const next = nextFrom(b)
              b.uturns = next === b.at ? b.uturns + 1 : 0
              b.at = b.to
              b.to = next
            }
            // Trapped on a stub, or too long chasing a stop it can't reach: give
            // this target up and take another, rather than shuttling forever.
            if (hops >= MAX_HOPS || b.uturns >= 2 || b.travel > MAX_TRAVEL) {
              b.target = pickTarget(nodes[b.at].x, nodes[b.at].z, b.target)
              b.uturns = 0
              b.travel = 0
              b.s = 0
            }
            p = place(b)
          }
        }

        // Stand it on the ground and orient to the road's slope — a pure yaw
        // would slide it down a hill dead level, the traffic's old bug.
        pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
        // Ease the drawn heading toward the edge so it arcs a junction; wrap the
        // delta to (-pi, pi] first, or a bus facing just past -pi takes the long
        // way round. Held still at a stop it simply keeps the heading it had.
        let d = p.angle - b.yaw
        d -= Math.round(d / (2 * Math.PI)) * (2 * Math.PI)
        if (b.state === 'driving') b.yaw += d * (1 - Math.exp(-TURN_RATE * dt))
        groundQuat(q, p.x, p.z, b.yaw, provider)
        b.group.position.copy(pos)
        b.group.quaternion.copy(q)

        b.glassMat.emissiveIntensity = night ? 0.9 : 0
        b.lampMat.emissiveIntensity = night ? 2.2 : 0

        // The kerb: figures out while a bus is in, gone the moment it drives off.
        if (b.state === 'paused' && b.target >= 0) {
          const stop = stopTargets[b.target].stop
          b.platform.position.set(stop.x, provider.heightAt(stop.x, stop.z), stop.z)
          b.platform.rotation.y = -p.angle // line the little crowd along the road
          const pr = 1 - Math.max(0, b.pauseT) / PAUSE_TIME
          b.figs.forEach((f, k) => {
            f.scale.setScalar(b.roles[k] ? boardCurve(pr) : alightCurve(pr))
          })
        } else {
          for (const f of b.figs) f.scale.setScalar(0)
        }
      }
    },
  }
}
