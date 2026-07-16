import type { CarInput, CarState } from '../vehicle/car'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'
import type { Road } from '../geo/types'

/** Close enough to a node to call it reached, in metres. */
const ARRIVE_R = 6
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

export interface Autopilot {
  enabled(): boolean
  setEnabled(on: boolean): void
  /** Re-home onto the road network — call after a city loads or the car moves. */
  reset(roads: Road[], car: CarState): void
  /** The input a driver would be giving right now. */
  drive(car: CarState, maxSpeed: number): CarInput
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
    drive(car, maxSpeed) {
      if (target < 0 || !graph.nodes.length) return { throttle: 0, steer: 0, brake: false }
      const t = graph.nodes[target]
      if (Math.hypot(t.x - car.x, t.z - car.z) < ARRIVE_R) advance()

      const goal = graph.nodes[target]
      const want = Math.atan2(goal.z - car.z, goal.x - car.x)
      const err = angleDelta(car.heading, want)
      const steer = Math.max(-1, Math.min(1, err * STEER_GAIN))

      const speed = Math.hypot(car.vx, car.vz)
      // Lift off for a sharp turn, and don't try to take the whole city at top speed.
      const sharp = Math.abs(err) > SLOW_ANGLE
      const wantSpeed = sharp
        ? Math.min(maxSpeed * 0.25, TURN_CAP)
        : Math.min(maxSpeed * CRUISE, CRUISE_CAP)
      return { throttle: speed > wantSpeed ? 0 : 1, steer, brake: sharp && speed > wantSpeed * 1.6 }
    },
  }
}
