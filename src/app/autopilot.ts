import type { CarInput, CarState } from '../vehicle/car'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'
import type { Road } from '../geo/types'
import type { Circle } from '../physics/collide'

/** Close enough to a node to call it reached, in metres. */
const ARRIVE_R = 6
/**
 * How many nodes it may skip in one frame. Junctions in a dense city are a
 * cluster of vertices metres apart — all of them already inside ARRIVE_R — so
 * aiming at the next one alone left the car chasing a target it had already
 * reached, twitching between roads. It walks past the whole cluster instead.
 */
const MAX_SKIP = 12
/** Steering gain: how hard it corrects toward the target bearing. */
const STEER_GAIN = 1.6
/** Ease off the throttle above this share of top speed. */
const CRUISE = 0.55
/**
 * Caps on how fast it will drive itself, m/s. Nitro multiplies top speed
 * tenfold; without these the demo would try to take a city street at 230m/s and
 * simply fold itself round the first building. With them, a boost reads as a
 * proper turn of speed and stays driveable.
 */
const CRUISE_CAP = 50
const TURN_CAP = 12
/** Slow for a turn sharper than this, radians. */
const SLOW_ANGLE = 0.5

/** How far ahead it looks for something to hit, in metres. */
const LOOK = 26
/** Anything nearer than this gets the brakes, hard. */
const PANIC = 9
/** Nearer than this and it simply stops and waits for the way to clear. */
const HOLD = 12
/** Half the car's width, plus room to be wrong by. */
const CLEAR = 2.4
/** How hard it swerves. Enough to miss; not enough to leave the road. */
const AVOID_STEER = 0.9

export interface Autopilot {
  enabled(): boolean
  setEnabled(on: boolean): void
  /** Re-home onto the road network — call after a city loads or the car moves. */
  reset(roads: Road[], car: CarState): void
  /**
   * The input a driver would be giving right now.
   *
   * @param hazards things in the world it should not drive into — traffic,
   *   people, trains
   */
  drive(car: CarState, maxSpeed: number, hazards?: Circle[]): CarInput
}

/** Deterministic PRNG, so a demo run is reproducible. */
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
 * The nearest hazard sitting in the car's path, in the car's own frame.
 *
 * `ahead` is how far up the road it is; `lateral` which side, and by how much.
 * Anything behind, or wide enough of the nose to miss, is ignored — a car that
 * brakes for everything within a radius never gets anywhere.
 */
export function nearestInPath(
  car: CarState,
  hazards: Circle[] | undefined,
): { ahead: number; lateral: number } | null {
  if (!hazards || !hazards.length) return null
  const fx = Math.cos(car.heading)
  const fz = Math.sin(car.heading)
  let best: { ahead: number; lateral: number } | null = null
  for (const h of hazards) {
    const dx = h.x - car.x
    const dz = h.z - car.z
    const ahead = dx * fx + dz * fz
    if (ahead <= 0 || ahead > LOOK) continue
    const lateral = -dx * fz + dz * fx // + is to the car's right
    if (Math.abs(lateral) > CLEAR + h.r) continue
    if (!best || ahead < best.ahead) best = { ahead, lateral }
  }
  return best
}

/** Shortest signed difference between two bearings, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Drives the car around the city on its own.
 *
 * It steers rather than teleports: the same throttle/steer/brake a player would
 * press, fed through the same physics. So it drifts, it collides with buildings,
 * and it sounds like whatever vehicle you left it in — a demo that cheated its
 * way along the roads would show you a game that doesn't exist.
 */
export function createAutopilot(): Autopilot {
  let on = false
  let graph: RoadGraph = { nodes: [], nearest: () => -1 }
  let from = -1
  let at = -1
  let target = -1
  const rng = makeRng(0xd0e1f2)

  const advance = (): void => {
    const next = nextNode(graph, from, target, rng)
    from = at
    at = target
    target = next
  }

  return {
    enabled: () => on,
    setEnabled(v) {
      on = v
    },
    reset(roads, car) {
      graph = buildRoadGraph(roads)
      at = graph.nearest(car.x, car.z)
      from = -1
      target = at >= 0 ? nextNode(graph, -1, at, rng) : -1
    },
    drive(car, maxSpeed, hazards) {
      if (target < 0 || !graph.nodes.length) return { throttle: 0, steer: 0, brake: false }
      for (let i = 0; i < MAX_SKIP; i++) {
        const t = graph.nodes[target]
        if (!t || Math.hypot(t.x - car.x, t.z - car.z) >= ARRIVE_R) break
        advance()
      }

      const goal = graph.nodes[target]
      const want = Math.atan2(goal.z - car.z, goal.x - car.x)
      const err = angleDelta(car.heading, want)
      const steer = Math.max(-1, Math.min(1, err * STEER_GAIN))

      const speed = Math.hypot(car.vx, car.vz)
      // Lift off for a sharp turn, and don't try to take the whole city at top speed.
      const sharp = Math.abs(err) > SLOW_ANGLE
      let wantSpeed = sharp
        ? Math.min(maxSpeed * 0.25, TURN_CAP)
        : Math.min(maxSpeed * CRUISE, CRUISE_CAP)
      let brake = sharp && speed > wantSpeed * 1.6
      let avoid = 0
      let hold = false

      // Look up the road. Anything in the way gets steered around, and anything
      // close gets the brakes — driving through a train is not a demo.
      const block = nearestInPath(car, hazards)
      if (block) {
        // Swerve away from whichever side it sits on; if it's dead ahead, pick one.
        avoid = (block.lateral === 0 ? 1 : -Math.sign(block.lateral)) * AVOID_STEER
        wantSpeed = Math.min(wantSpeed, block.ahead * 0.4)
        // Brake on the gap, not on a fixed distance: at 22m/s, waiting until
        // PANIC metres means arriving at it regardless. And swerving cannot save
        // you from a train across the road — only stopping can.
        if (block.ahead < PANIC || speed > wantSpeed * 1.2) brake = true
        // Close in, hold: without this it stops, finds itself under its target
        // speed, opens the throttle again and inches into whatever it stopped for.
        if (block.ahead < HOLD) hold = true
      }

      const wheel = Math.max(-1, Math.min(1, steer + avoid))
      return { throttle: hold || speed > wantSpeed ? 0 : 1, steer: wheel, brake }
    },
  }
}
