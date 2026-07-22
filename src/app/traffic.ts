import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { DeckIndex } from '../world/bridge'
import { groundQuat } from '../terrain/slope'
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
/**
 * How fast a car swings its nose round to the direction it's driving, per second.
 *
 * The car's position is pinned to the road graph, but its heading is eased toward
 * the current edge rather than set to it (see the yaw step in `update`): at a
 * junction the target flips 90 degrees in one frame, and easing turns that snap
 * into an arc. `1 - exp(-k*dt)` is the framerate-independent fraction closed per
 * frame; k=5 rounds a right-angle over roughly half a second, a believable corner
 * at street speed without the nose lagging so far it reads as a skid.
 */
const TURN_RATE = 5
/** Guard on the walk below, so a pile of coincident nodes can't spin forever. */
const MAX_HOPS = 8
/** How far up its own road a car looks for a train, in metres. */
const CROSSING_LOOK = 11
/**
 * Car-to-car following. A background car is a point walking an edge, and it
 * read none of its neighbours: a faster car caught a slower one and interpolated
 * clean through it — two cars in the same spot, one sliding out the far side.
 * Now each holds a gap to the car ahead in its lane. FOLLOW_GAP is the smallest
 * centre-to-centre distance kept (a car's ~4m plus a margin), and BRAKE_ZONE is
 * the run-up over which the step eases from full speed down to a dead stop, so a
 * blocked car coasts onto the leader's tail rather than stamping on the brake.
 */
const FOLLOW_GAP = 7
const BRAKE_ZONE = 6

/**
 * Obeying the traffic lights.
 *
 * A bot entering a signalled junction holds at a stop line STOP_SETBACK metres
 * back from the junction node while its light is amber/red, then goes on green.
 * It reuses the very same brake-to-a-gap logic it already uses for the car and
 * the parked car ahead: the light just contributes one more "clearance" the step
 * is capped by, so the bot coasts to a halt at the line rather than stamping the
 * brake.
 *
 * MAX_WAIT_S is the anti-deadlock fail-safe — a car held this long proceeds no
 * matter what the light says, so a mistimed signal can NEVER freeze it for good.
 * Together with the light's own guarantee that it turns green for part of every
 * cycle (trafficLights.ts `signalPhase` depends on the clock alone, never on the
 * traffic), no car is ever held indefinitely and the streets cannot gridlock.
 * WAIT_NEAR is how close to the stop line the car must be for the wait to count
 * as "held" (rather than merely driving toward a distant red). LIGHT_SNAP is how
 * near a graph node a signalled junction must be to be treated as its light —
 * both are welded on the same 0.5m grid, so they coincide; the slack costs nothing.
 */
const STOP_SETBACK = 4
export const MAX_WAIT_S = 10
const WAIT_NEAR = 2
const LIGHT_SNAP = 3

/**
 * What traffic needs of the traffic lights: where the signalled junctions are,
 * and whether each currently says STOP. Structural, so traffic doesn't reach into
 * trafficLights' internals — `createTrafficLights`' return satisfies it directly.
 */
export interface SignalSource {
  readonly junctions: readonly Vec2[]
  isStop(index: number): boolean
}

/**
 * How far a bot may still advance toward the junction it is entering before that
 * junction's light, given the distance left to the junction node (`remain`),
 * whether the light says stop (`wantStop`), and how long the car has already been
 * held (`held`, seconds).
 *
 * Returns the along-road clearance to the stop line — the caller caps its step by
 * it, so a small value brakes the car to a halt at the line. Infinity means
 * "proceed": on green (`!wantStop`), when the car is already past the stop line
 * (so it never freezes IN the junction box, and short final edges don't trap it),
 * and when the max-wait fail-safe has fired (`held >= MAX_WAIT_S`). Pure, so the
 * hold / go / fail-safe decision is unit-testable without the sim.
 */
export function lightClearance(remain: number, wantStop: boolean, held: number): number {
  if (!wantStop || held >= MAX_WAIT_S) return Infinity
  const toLine = remain - STOP_SETBACK
  return toLine > 0 ? toLine : Infinity
}

/**
 * Parked cars as static obstacles.
 *
 * A retail park's service aisles run right through its bays, so the road graph
 * carries a bot straight across ground the parked cars already occupy — and with
 * no physics the bot sailed clean through them. The parked positions are handed
 * in (see the `parkedCars` argument) and a bot holds a gap to the nearest one
 * dead ahead in its path, exactly as it does behind a moving car: PARKED_GAP is
 * the along-road distance it keeps to the parked car's centre (a bot's nose plus
 * the parked car's half-length and a margin), PARKED_LOOK how far up the road it
 * watches for one — long enough that BRAKE_ZONE fits inside the run-up so it
 * coasts to a halt rather than stamping the brake — and PARKED_HALF the lateral
 * reach either side of the bot's line that counts as "in the way", so a car
 * parked well off the aisle is passed and only one actually blocking it stops it.
 * PARK_CELL buckets the (static) parked cars into a fixed grid built once, so a
 * bot tests only the handful in its own cell and the ring around it, never the
 * whole lot; it is >= PARKED_LOOK so a 3x3 neighbourhood is guaranteed to catch
 * every car within reach.
 */
const PARKED_GAP = 5
const PARKED_LOOK = 12
const PARKED_HALF = 3
const PARK_CELL = 16

/**
 * Ramming knockback. When the player's car shoves a bot (see `shove`), it sets a
 * knockback *target* off the bot's route; the drawn offset then eases toward that
 * target and the target relaxes back to zero — so the bot swings aside and back
 * smoothly rather than snapping there in one frame. KNOCK_EASE is how fast the
 * offset chases the target (the ramp-out), KNOCK_DECAY how fast the target relaxes
 * home (e^-k*t), MAX_KNOCK caps it so even a full-speed hit can't fling a car
 * across the street, and SHOVE_REACH is how close to the impact a car must be to
 * feel it — a car's length or so, enough to catch the one hit.
 */
const KNOCK_EASE = 6
const KNOCK_DECAY = 4
const MAX_KNOCK = 3
const SHOVE_REACH = 6

/**
 * Oncoming cars flinch aside when you bear down on them head-on. Bot cars are one
 * InstancedMesh, so a per-car headlight flash is out; the reaction rides the same
 * knockback offset a shove uses (tx/tz), nudging the car toward its own kerb so it
 * gets out of your way. It fires only when you're actually driving AT an oncoming
 * car — fast enough, close ahead, roughly in its path, and it's facing back toward
 * you — so a car you're merely following never twitches.
 */
const FLINCH_MIN_SPEED = 9 // m/s (~32 km/h): below this you aren't bearing down
const FLINCH_REACH = 34 // how far ahead an oncoming car reacts, metres
const FLINCH_WIDTH = 4.5 // how far off your line it can be and still flinch, metres
const FLINCH_ONCOMING = 0.2 // headings must oppose by more than this (dot < -0.2 ≈ >100° apart)
const FLINCH_PUSH = 0.9 // metres of sideways nudge added to its knockback target

/**
 * How an oncoming bot at (ax,az,ayaw) flinches from a driver at (px,pz) heading
 * `ph` at `speed` — the sideways push to add to its knockback, or null if it has
 * no business reacting (you're slow, it's behind you, off to the side, or driving
 * the same way as you). Pure, so the head-on rule is tested without the sim.
 */
export function oncomingFlinch(
  px: number, pz: number, ph: number, speed: number,
  ax: number, az: number, ayaw: number,
): { pushX: number; pushZ: number } | null {
  if (!(speed >= FLINCH_MIN_SPEED)) return null
  const fx = Math.cos(ph), fz = Math.sin(ph)
  const relx = ax - px, relz = az - pz
  const ahead = relx * fx + relz * fz
  if (ahead <= 0 || ahead > FLINCH_REACH) return null // behind you, or too far ahead
  const rx = -fz, rz = fx // the driver's right
  const lateral = relx * rx + relz * rz
  if (Math.abs(lateral) > FLINCH_WIDTH) return null // not in your path
  const bfx = Math.cos(ayaw), bfz = Math.sin(ayaw)
  if (fx * bfx + fz * bfz > -FLINCH_ONCOMING) return null // same-ish way: not oncoming
  const side = lateral >= 0 ? 1 : -1 // shove further to whichever side it already leans
  return { pushX: rx * side * FLINCH_PUSH, pushZ: rz * side * FLINCH_PUSH }
}

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
  /**
   * Knock any car near (x, z) back along (dirX, dirZ) — the player ramming one.
   * The shove is a displacement that decays to zero over the next second or so
   * (see KNOCK_DECAY), so the bot lurches aside then drives on from there. Cars
   * within SHOVE_REACH all feel it; the direction is normalised, `strength` is
   * the metres of offset applied (clamped to MAX_KNOCK).
   */
  shove(x: number, z: number, dirX: number, dirZ: number, strength: number): void
  /**
   * Scatter every car within `radius` of (x, z) straight AWAY from it — the horn
   * clearing a path. Same eased knockback as {@link shove}, but each car's push is
   * radial (outward from the source), not one shared direction. Parked cars aren't
   * traffic agents, so they're untouched by construction.
   */
  scatter(x: number, z: number, radius: number, strength: number): void
  /**
   * The player is driving at `speed` from (x,z) heading `heading`: oncoming cars
   * close ahead in their path flinch aside (via the same eased knockback as a
   * shove). Returns how many reacted this call, so the caller can react in turn
   * (e.g. a honk). Same-direction and out-of-path cars are left alone.
   */
  reactToDriver(x: number, z: number, heading: number, speed: number): number
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
  /** The heading actually drawn, eased toward the edge direction, so the car
   *  arcs through a junction instead of snapping 90 degrees on the spot. */
  yaw: number
  /** True while the current segment belongs to a bridge road, so the car rides
   *  the deck overhead rather than the ground beneath it. Resolved once per
   *  segment from the road-edge lookup, not scanned per frame. */
  bridge: boolean
  /** Ramming knockback: the drawn offset (metres) off the route (kx/kz), and the
   *  target it eases toward (tx/tz) which itself relaxes to zero. All zero when
   *  undisturbed; a shove sets the target, not the offset, so the lurch is smooth. */
  kx: number
  kz: number
  tx: number
  tz: number
  /** Seconds spent held at a red light on this approach, for the max-wait
   *  fail-safe (see MAX_WAIT_S). Reset to zero on green and on crossing a node. */
  held: number
}

interface Placed {
  x: number
  z: number
  angle: number
  /** The point on the centreline, before the lane offset — where the deck is
   *  sampled, so the height query stays on the deck whatever the offset does. */
  cx: number
  cz: number
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
  // Static parked cars (a retail park's bays) the bots must not drive through.
  // Only their positions matter here; ParkedCar[] passes straight in as it is a
  // superset of Vec2. Empty by default, so a city with no lots wires nothing.
  parkedCars: readonly Vec2[] = [],
  // Where the bridge decks are, so a bot on a bridge road rides the deck instead
  // of trailing along the ground under it. Defaults to a no-op index (the shape
  // main.ts holds before a city loads), so nothing breaks when a city has no
  // bridges or a caller passes none.
  decks: DeckIndex = { heightAt: () => null },
  // The city's traffic lights, so a bot holds at a red and goes on green. Null
  // (the default) keeps the old ambient-only behaviour, so any caller/test that
  // passes no lights is unaffected.
  lights: SignalSource | null = null,
): Traffic {
  const group = new THREE.Group()
  scene.add(group)
  group.userData.neonMover = 'bot' // so the theme flips the bot cars to neon wireframe like the world
  const graph: RoadGraph = buildRoadGraph(roads)

  // Map each signalled junction onto the graph node a car approaches it by, so a
  // car can look up "is the light at the node I'm entering red?" in O(1) — one
  // array read plus one live phase read, no per-car scan of the lights. Built
  // once at construction; the light STATE itself is read live each frame. -1 is
  // "no light governs this node". The junctions and the graph are welded on the
  // same 0.5m grid, so a signalled junction sits on its node; LIGHT_SNAP is slack.
  const nodeLight: number[] = new Array(graph.nodes.length).fill(-1)
  if (lights) {
    lights.junctions.forEach((j, i) => {
      const nd = graph.nearest(j.x, j.z)
      if (nd >= 0 && Math.hypot(graph.nodes[nd].x - j.x, graph.nodes[nd].z - j.z) < LIGHT_SNAP) {
        nodeLight[nd] = i
      }
    })
  }
  const rng = makeRng(0xc0ffee)
  const agents: Agent[] = []

  // Which welded graph edges belong to a bridge road, so a bot on one is seated
  // on the deck rather than the ground below. The graph carries no bridge flag,
  // so we recover it from the roads: each bridge road's points are graph
  // vertices, so `nearest` resolves them to node ids, keyed as an unordered
  // pair. A one-off at construction — a city has a handful of bridges.
  const bridgeEdges = new Set<string>()
  const edgeKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`)
  for (const road of roads) {
    if (!road.bridge || road.points.length < 2) continue
    let prev = -1
    for (const p of road.points) {
      const id = graph.nearest(p.x, p.z)
      if (id >= 0 && prev >= 0 && id !== prev) bridgeEdges.add(edgeKey(prev, id))
      prev = id
    }
  }
  const onBridge = (a: number, b: number): boolean => bridgeEdges.has(edgeKey(a, b))

  // Static parked cars filed once into a fixed grid (see PARK_CELL). Nothing here
  // moves, so the grid is built at construction and a bot only ever tests the few
  // cars in its own cell and the ring around it. The cell key packs the signed
  // grid coordinates into one integer — no string, so a lookup allocates nothing
  // per frame. The +4096 offset keeps both coordinates positive for cities out to
  // ~65km from the origin, far past any map.
  const parkX: number[] = []
  const parkZ: number[] = []
  const parkBucket = new Map<number, number[]>()
  const parkKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096)
  for (const c of parkedCars) {
    const idx = parkX.length
    parkX.push(c.x)
    parkZ.push(c.z)
    const k = parkKey(Math.floor(c.x / PARK_CELL), Math.floor(c.z / PARK_CELL))
    const b = parkBucket.get(k)
    if (b) b.push(idx)
    else parkBucket.set(k, [idx])
  }
  /**
   * Distance straight ahead to the nearest parked car in a bot's path from
   * (px, pz) heading `angle`, or Infinity when the way is clear. Only cars up to
   * PARKED_LOOK ahead and within PARKED_HALF either side count as blocking; a car
   * off to the side is passed. Bounded to the 3x3 grid cells around the bot, so
   * it stays O(1) however many are parked across the map.
   */
  const parkedAhead = (px: number, pz: number, angle: number): number => {
    if (parkBucket.size === 0) return Infinity
    const cs = Math.cos(angle)
    const sn = Math.sin(angle)
    const gx = Math.floor(px / PARK_CELL)
    const gz = Math.floor(pz / PARK_CELL)
    let best = Infinity
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iz = gz - 1; iz <= gz + 1; iz++) {
        const b = parkBucket.get(parkKey(ix, iz))
        if (!b) continue
        for (const j of b) {
          const dx = parkX[j] - px
          const dz = parkZ[j] - pz
          const ahead = dx * cs + dz * sn
          if (ahead < -PARKED_HALF || ahead > PARKED_LOOK) continue
          const lateral = -dx * sn + dz * cs
          if (Math.abs(lateral) > PARKED_HALF) continue
          if (ahead < best) best = ahead
        }
      }
    }
    return best
  }

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
    // Start already facing along the first edge, or a car winking in beyond the
    // fog would spend its first half-second slewing round from a stale heading.
    const A = graph.nodes[at]
    const B = graph.nodes[to]
    const yaw = Math.atan2(B.z - A.z, B.x - A.x)
    return { at, to, s: 0, speed: 7 + rand() * 6, type: Math.floor(rand() * BODY_TYPES.length), uturns: 0, yaw, bridge: onBridge(at, to), kx: 0, kz: 0, tx: 0, tz: 0, held: 0 }
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

  const place = (a: Agent): Placed => {
    const A = graph.nodes[a.at]
    const B = graph.nodes[a.to]
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const f = Math.min(1, a.s / len)
    const angle = Math.atan2(B.z - A.z, B.x - A.x)
    const cx = A.x + (B.x - A.x) * f
    const cz = A.z + (B.z - A.z) * f
    // Keep right of the centreline, so oncoming cars pass rather than merge.
    return {
      x: cx + Math.sin(angle) * LANE,
      z: cz - Math.cos(angle) * LANE,
      angle,
      cx,
      cz,
    }
  }

  const solidAt: Circle[] = []

  // Car-to-car separation, kept O(cars) by bucketing.
  //
  // Each frame every car is filed under the directed edge it's driving (its
  // `at -> to`), and its arc position `s` is snapshotted alongside. A car then
  // only compares itself against the few cars sharing its edge, plus the cars
  // just past the node it's heading into — never against all of them. With a
  // couple of dozen cars spread over a city that's a handful of comparisons
  // each, so a busy junction costs no more than an empty street.
  const N = graph.nodes.length
  const bucket = new Map<number, number[]>()
  const snapEdge: number[] = []
  const snapArc: number[] = []

  /**
   * Distance along the road to the nearest car ahead of car `i` in its own lane
   * — on this edge, or just across the node it's approaching — or Infinity when
   * the road ahead is clear. Only same-direction cars count: oncoming traffic
   * keeps to the other lane (see LANE) and passes, so it's skipped at the
   * junction. Looking only forward, never at cars merely converging on the same
   * node from another road, is what keeps two of them from each yielding to the
   * other and deadlocking the junction — nobody waits on a car behind them.
   */
  const gapAhead = (i: number): number => {
    const a = agents[i]
    const s = snapArc[i]
    let best = Infinity
    const same = bucket.get(snapEdge[i])
    if (same) {
      for (const j of same) {
        if (j === i) continue
        const sj = snapArc[j]
        // Two cars pinned to the exact same spot would each yield to the other
        // and both freeze; the lower index gives way, so precisely one does.
        if (sj > s || (sj === s && j < i)) best = Math.min(best, sj - s)
      }
    }
    const A = graph.nodes[a.at]
    const B = graph.nodes[a.to]
    const remain = Math.hypot(B.x - A.x, B.z - A.z) - s
    for (const x of graph.nodes[a.to].links) {
      if (x === a.at) continue // that edge is oncoming, in the other lane
      const out = bucket.get(a.to * N + x)
      if (out) for (const j of out) best = Math.min(best, remain + snapArc[j])
    }
    return best
  }

  return {
    obstacles: () => solidAt,
    shove(x, z, dirX, dirZ, strength) {
      const len = Math.hypot(dirX, dirZ)
      if (len < 1e-6 || !Number.isFinite(strength)) return // no direction, nothing to do
      const ux = dirX / len
      const uz = dirZ / len
      for (const a of agents) {
        const p = place(a)
        // Measure to where the car actually is — its route position plus any
        // knockback it's still carrying — so a second shove stacks onto the first.
        const dx = p.x + a.kx - x
        const dz = p.z + a.kz - z
        if (dx * dx + dz * dz > SHOVE_REACH * SHOVE_REACH) continue
        // Set the target the offset eases toward, not the offset itself — that's
        // what keeps the lurch smooth. A second shove stacks onto the target.
        a.tx += ux * strength
        a.tz += uz * strength
        // Cap the target so even a full-speed shunt only shoves a car aside, not
        // clean across the road.
        const k = Math.hypot(a.tx, a.tz)
        if (k > MAX_KNOCK) {
          a.tx *= MAX_KNOCK / k
          a.tz *= MAX_KNOCK / k
        }
      }
    },
    scatter(x, z, radius, strength) {
      if (!Number.isFinite(strength) || radius <= 0) return
      for (const a of agents) {
        const p = place(a)
        const dx = p.x + a.kx - x
        const dz = p.z + a.kz - z
        const d2 = dx * dx + dz * dz
        if (d2 > radius * radius || d2 < 1e-6) continue // out of earshot, or right on the car
        const d = Math.sqrt(d2)
        // Push straight away from the source, easing toward the target like a shove.
        a.tx += (dx / d) * strength
        a.tz += (dz / d) * strength
        const k = Math.hypot(a.tx, a.tz)
        if (k > MAX_KNOCK) {
          a.tx *= MAX_KNOCK / k
          a.tz *= MAX_KNOCK / k
        }
      }
    },
    reactToDriver(x, z, heading, speed) {
      let flinched = 0
      for (const a of agents) {
        const p = place(a)
        const push = oncomingFlinch(x, z, heading, speed, p.x + a.kx, p.z + a.kz, a.yaw)
        if (!push) continue
        a.tx += push.pushX
        a.tz += push.pushZ
        const k = Math.hypot(a.tx, a.tz)
        if (k > MAX_KNOCK) {
          a.tx *= MAX_KNOCK / k
          a.tz *= MAX_KNOCK / k
        }
        flinched++
      }
      return flinched
    },
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
      // Rebuild the following buckets from this frame's positions (see gapAhead).
      // Snapshotting `s` here, before anyone moves, keeps a car that hops to a
      // new edge partway through the loop from shifting the gap for one still
      // being processed — every car is measured against the same frozen frame.
      bucket.clear()
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i]
        snapEdge[i] = a.at * N + a.to
        snapArc[i] = a.s
        const b = bucket.get(snapEdge[i])
        if (b) b.push(i)
        else bucket.set(snapEdge[i], [i])
      }
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
        // Advance, but no further than the gap to whatever is ahead allows —
        // the moving car in front (gapAhead) or a static parked car the aisle
        // runs across (parkedAhead). Take the tighter of the two, then ease the
        // step to zero as that gap closes, so a car coasts to a halt onto the
        // obstacle rather than lurching the last metre and jittering.
        let step = blocked ? 0 : a.speed * dt
        if (step > 0) {
          let clear = gapAhead(i) - FOLLOW_GAP
          const parked = parkedAhead(here.x, here.z, here.angle) - PARKED_GAP
          if (parked < clear) clear = parked
          // Hold at a red light: cap the clearance at the stop line short of the
          // junction node this car is entering, and count the seconds it waits
          // there so the max-wait fail-safe can release it. O(1) — one array read
          // plus one live phase read; no scan of the lights.
          const li = nodeLight[a.to]
          const wantStop = li >= 0 && !!lights && lights.isStop(li)
          const A = graph.nodes[a.at]
          const B = graph.nodes[a.to]
          const remain = Math.hypot(B.x - A.x, B.z - A.z) - a.s
          const lightClear = lightClearance(remain, wantStop, a.held)
          if (lightClear < clear) clear = lightClear
          if (wantStop && a.held < MAX_WAIT_S && remain > STOP_SETBACK && remain - STOP_SETBACK < WAIT_NEAR) {
            a.held += dt // queued at the line: accrue the wait toward the fail-safe
          } else if (!wantStop) {
            a.held = 0 // green (or no light): a fresh countdown for the next red
          }
          if (clear < BRAKE_ZONE) step *= Math.max(0, clear / BRAKE_ZONE)
          step = Math.min(step, Math.max(0, clear))
        }
        a.s += step
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
        // A fresh segment may cross onto or off a bridge; resolve that here, once
        // per segment (a set lookup, not a deck scan), so the height below knows
        // whether to seat the car on the deck or the ground. A recycled car gets
        // its flag from spawn, so this only needs to fire when the edge changed.
        // Crossing a node also clears any light-wait: it belonged to the junction
        // just left, and the next approach starts a fresh countdown.
        if (hops > 0) {
          a.bridge = onBridge(a.at, a.to)
          a.held = 0
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

        // Ramming knockback, framerate-independent: the drawn offset eases toward
        // its target (a smooth ramp-out, no one-frame snap) while the target itself
        // relaxes to zero, so the bot swings aside and settles back onto its route.
        const ease = 1 - Math.exp(-KNOCK_EASE * dt)
        a.kx += (a.tx - a.kx) * ease
        a.kz += (a.tz - a.kz) * ease
        a.tx *= Math.exp(-KNOCK_DECAY * dt)
        a.tz *= Math.exp(-KNOCK_DECAY * dt)
        const px = p.x + a.kx
        const pz = p.z + a.kz

        solidAt.push({ x: px, z: pz, r: 2.0 })
        // On a bridge the car rides the deck, not the ground under it. The deck is
        // flat across its width, so its height at the centreline is its height at
        // the lane too; sampling the centreline (p.cx, p.cz) keeps the query on the
        // deck however far the lane offset pushes the car toward its edge. Fall
        // back to the ground if there's somehow no deck here (or none were passed).
        const y = a.bridge ? decks.heightAt(p.cx, p.cz) ?? provider.heightAt(px, pz) : provider.heightAt(px, pz)
        pos.set(px, y, pz)
        // Ease the drawn heading toward the edge's direction rather than taking
        // it whole. `place` snaps `angle` the instant a car crosses a junction
        // node — the yaw jumped a right-angle in one frame and the car pivoted on
        // the spot. Closing a framerate-independent fraction of the gap per frame
        // arcs the nose round instead. The position is still pinned to the graph,
        // so the car never cuts the corner off the tarmac or drifts into oncoming;
        // only its heading lags, briefly, through the turn. Wrap the delta to
        // (-pi, pi] first, or a car facing just past -pi would take the long way.
        let d = p.angle - a.yaw
        d -= Math.round(d / (2 * Math.PI)) * (2 * Math.PI)
        a.yaw += d * (1 - Math.exp(-TURN_RATE * dt))
        // Stood on the road's slope, not merely turned to face along it: a pure
        // yaw slid every car down every hill dead level, like a lift.
        groundQuat(q, p.x, p.z, a.yaw, provider)
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
