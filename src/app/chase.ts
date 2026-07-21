import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import { SpatialGrid } from '../physics/grid'
import type { ElevationProvider } from '../terrain/provider'
import { groundQuat } from '../terrain/slope'
import { createCar, stepCar, type CarInput, type CarState } from '../vehicle/car'
import { buildVehicleMesh } from '../vehicle/model'
import { VEHICLES } from '../vehicle/vehicles'
import { buildRoadGraph, type RoadGraph } from '../world/roadGraph'
import { findRoute } from '../world/route'
import { angleDelta } from './autopilot'

/** How close a cop must get to bust you, metres. */
export const CATCH_R = 9
/** Seconds you must stay free to escape a round. */
export const EVADE_TIME = 50
/** Cops spawn at least this far from you — a chase, not an ambush, metres. */
const SPAWN_MIN = 220
/** Two cops start no nearer this to each other, so they fan out rather than share a corner. */
const SPAWN_SEP = 40
/** Seconds between re-routing a cop toward the player's live position. */
const REPATH_EVERY = 1.2
/** Top speed a cop will hold, m/s — a shade under a sports car so a sharp driver escapes. */
const COP_CAP = 24
/** How many cop cars chase you. */
const COP_COUNT = 2
/** The cops all drive the police interceptor. */
const COP_TYPE = 'police'

// --- following, borrowed wholesale from rivals.ts ---
/** Close enough to a route node to call it reached, metres. */
const ARRIVE_R = 6
/** Route nodes it may skip in one frame (a junction is a cluster of vertices). */
const MAX_SKIP = 12
/** Steering gain toward the target bearing (autopilot's figure). */
const STEER_GAIN = 1.6

export interface ChaseState {
  active: boolean
  /** Seconds left before you escape this round. */
  timeLeft: number
  /** Rounds escaped so far. */
  score: number
  /** Metres to the nearest cop, for the HUD. */
  nearest: number
  justEscaped: boolean // set for one frame on a win
  justBusted: boolean // set for one frame on a loss
}

export interface Chase {
  setEnabled(on: boolean): void
  enabled(): boolean
  /** The nearest cop, for the minimap arrow. Null when off or before any spawn. */
  target(): Vec2 | null
  /**
   * @param grid the city's solid footprints. Taken here, not at construction:
   *   `main.ts` swaps the grid wholesale on a city load, so a cop holding the old
   *   one would drive this city through every wall. Mirrors rivals.reset.
   */
  reset(roads: Road[], grid: SpatialGrid, provider: ElevationProvider, car: { x: number; z: number }): void
  update(dt: number, car: { x: number; z: number }): ChaseState
  state(): ChaseState
  dispose(): void
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Metres to the nearest cop, or Infinity when there are none. Pure. */
export function nearestCopDist(cops: { x: number; z: number }[], car: { x: number; z: number }): number {
  let best = Infinity
  for (const c of cops) best = Math.min(best, dist(c, car))
  return best
}

export type Outcome = 'ongoing' | 'escaped' | 'busted'

/**
 * The round's fate this frame: a cop within CATCH_R busts you (a catch beats the
 * clock), else the clock running out is an escape, else it plays on. Pure — the
 * one place the win/lose rule lives, so it can be tested without the road AI.
 */
export function roundOutcome(timeLeft: number, nearestCop: number): Outcome {
  if (nearestCop < CATCH_R) return 'busted'
  if (timeLeft <= 0) return 'escaped'
  return 'ongoing'
}

/**
 * Pick spawn nodes for the cops: road vertices at least `minDist` from the player
 * (never on top of them) and `SPAWN_SEP` apart from each other, so a fresh round
 * puts the cops out at arm's length and fanned out. Returns node indices.
 *
 * Falls back to any far-enough node when the ideal spacing can't be met, and to
 * `[]` on an empty graph — the caller rings the cops around the player instead.
 * Pure over the graph, so it is tested with a mock graph rather than the A*.
 */
export function farNodes(
  graph: RoadGraph,
  car: { x: number; z: number },
  count: number,
  minDist: number,
  rand: () => number,
): number[] {
  const nodes = graph.nodes
  if (!nodes.length) return []
  const far: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    if (dist(nodes[i], car) >= minDist) far.push(i)
  }
  const pool = far.length ? far : nodes.map((_, i) => i) // graph too small to keep the distance
  const picked: number[] = []
  for (let tries = 0; tries < 300 && picked.length < count; tries++) {
    const cand = pool[Math.floor(rand() * pool.length)]
    if (picked.includes(cand)) continue
    if (picked.every((p) => dist(nodes[p], nodes[cand]) >= SPAWN_SEP)) picked.push(cand)
  }
  // Spacing too strict for a small pool: top up with any distinct node so every cop spawns.
  for (let i = 0; i < pool.length && picked.length < count; i++) {
    if (!picked.includes(pool[i])) picked.push(pool[i])
  }
  return picked
}

interface Cop {
  car: CarState
  mesh: THREE.Group
  /** Node indices from `findRoute`, and how far along them it has walked. */
  route: number[]
  step: number
  /** Seconds until this cop re-routes to the player's current spot. */
  repath: number
}

/**
 * Cops & Robbers: an AI police car (two of them) hunts the player down. Survive
 * the evade timer and you escape — the score climbs by one and a fresh round
 * spawns the cops far off again; let a cop within CATCH_R and you are busted and
 * a new round starts with the score held.
 *
 * A cop is a real `CarState` driven through `stepCar`, exactly like the player
 * and the rivals: it follows an A* route over the road graph, but unlike a rival
 * (which chases fixed gates) it re-routes to the player's LIVE position every
 * `REPATH_EVERY` seconds, so it pursues you through the streets.
 */
export function createChase(scene: THREE.Scene, rand: () => number = Math.random): Chase {
  const group = new THREE.Group()
  group.visible = false
  group.userData.neonMover = 'bot' // neon flips the cop cars to wireframe like the road traffic
  scene.add(group)

  let on = false
  let height: ElevationProvider = { heightAt: () => 0 }
  let solid = new SpatialGrid([], 25)
  let graph: RoadGraph = { nodes: [], nearest: () => -1 }
  let cops: Cop[] = []

  let timeLeft = 0
  let score = 0
  let nearest = Infinity
  let justEscaped = false
  let justBusted = false
  const lastCar = { x: 0, z: 0 } // where the player was last seen, for target()

  const show = (cop: Cop): void => {
    cop.mesh.position.set(cop.car.x, cop.car.y, cop.car.z)
    groundQuat(cop.mesh.quaternion, cop.car.x, cop.car.z, cop.car.heading, height)
  }

  /** A fresh route from where a cop is to the road node nearest the player. */
  const routeToPlayer = (cop: Cop, player: { x: number; z: number }): void => {
    cop.route = []
    cop.step = 0
    cop.repath = REPATH_EVERY
    if (!graph.nodes.length) return
    cop.route = findRoute(graph, graph.nearest(cop.car.x, cop.car.z), graph.nearest(player.x, player.z))
  }

  /** Put every cop back out at least SPAWN_MIN from the player and aim it at them. */
  const spawnCops = (from: { x: number; z: number }): void => {
    const picks = farNodes(graph, from, cops.length, SPAWN_MIN, rand)
    cops.forEach((cop, i) => {
      const node = picks[i] !== undefined ? graph.nodes[picks[i]] : undefined
      let x: number
      let z: number
      if (node) {
        x = node.x
        z = node.z
      } else {
        // No usable node (tiny/empty graph): ring the cops around the player.
        const a = (i / Math.max(1, cops.length)) * Math.PI * 2
        x = from.x + Math.cos(a) * SPAWN_MIN
        z = from.z + Math.sin(a) * SPAWN_MIN
      }
      cop.car = createCar(x, z)
      cop.car.y = height.heightAt(x, z)
      cop.car.heading = Math.atan2(from.z - z, from.x - x) // face the player
      cop.repath = 0 // route on the very next frame
      routeToPlayer(cop, from)
      show(cop)
    })
  }

  /** Drive one cop a frame: re-target periodically, then follow the route toward the player. */
  const driveCop = (cop: Cop, dt: number, player: { x: number; z: number }): void => {
    cop.repath -= dt
    if (cop.repath <= 0) routeToPlayer(cop, player)

    for (let i = 0; i < MAX_SKIP; i++) {
      const node = graph.nodes[cop.route[cop.step]]
      if (!node || dist(node, cop.car) >= ARRIVE_R) break
      cop.step++
    }
    // The route ran out or never existed (player on an island the cop can't reach
    // by road): steer straight at them — a parked cop looks broken, a driving one
    // does not, and the next re-path may well find a way through.
    const aim = graph.nodes[cop.route[cop.step]] ?? player
    const err = angleDelta(cop.car.heading, Math.atan2(aim.z - cop.car.z, aim.x - cop.car.x))
    const speed = Math.hypot(cop.car.vx, cop.car.vz)
    const input: CarInput = {
      throttle: speed > COP_CAP ? 0 : 1,
      steer: Math.max(-1, Math.min(1, err * STEER_GAIN)),
      brake: false,
    }
    cop.car = stepCar(cop.car, input, dt, solid, height, VEHICLES[COP_TYPE])
    show(cop)
  }

  /** Start a fresh round: reset the clock and put the cops back out far. */
  const newRound = (from: { x: number; z: number }): void => {
    timeLeft = EVADE_TIME
    spawnCops(from)
  }

  const snapshot = (): ChaseState => ({
    active: on,
    timeLeft: Math.max(0, timeLeft),
    score,
    nearest,
    justEscaped,
    justBusted,
  })

  return {
    enabled: () => on,
    target: () => {
      if (!on || !cops.length) return null
      let best: Cop = cops[0]
      let bestD = Infinity
      for (const c of cops) {
        const d = dist(c.car, lastCar)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      return { x: best.car.x, z: best.car.z }
    },
    setEnabled(v) {
      on = v
      group.visible = v
    },
    reset(roads, buildings, prov, car) {
      height = prov
      solid = buildings
      graph = buildRoadGraph(roads)
      // The meshes are the dear part and never change: build them once, reuse them
      // every reset. `dispose` frees them. (Same trick as rivals.)
      if (!cops.length) {
        cops = Array.from({ length: COP_COUNT }, () => {
          const mesh = buildVehicleMesh(COP_TYPE)
          group.add(mesh)
          return { car: createCar(), mesh, route: [], step: 0, repath: 0 }
        })
      }
      score = 0
      nearest = Infinity
      justEscaped = false
      justBusted = false
      lastCar.x = car.x
      lastCar.z = car.z
      newRound(car)
      nearest = nearestCopDist(cops.map((c) => c.car), car)
    },
    update(dt, car) {
      justEscaped = false
      justBusted = false
      if (!on || !cops.length) return snapshot()
      lastCar.x = car.x
      lastCar.z = car.z
      timeLeft -= dt
      for (const cop of cops) driveCop(cop, dt, car)
      nearest = nearestCopDist(cops.map((c) => c.car), car)
      const outcome = roundOutcome(timeLeft, nearest)
      if (outcome === 'busted') {
        justBusted = true
        newRound(car) // caught — a new round, the score held
        nearest = nearestCopDist(cops.map((c) => c.car), car)
      } else if (outcome === 'escaped') {
        score++
        justEscaped = true
        newRound(car) // got away — score it and reset
        nearest = nearestCopDist(cops.map((c) => c.car), car)
      }
      return snapshot()
    },
    state: snapshot,
    dispose() {
      for (const cop of cops) {
        cop.mesh.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.geometry) m.geometry.dispose()
          const mat = m.material
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
        })
        group.remove(cop.mesh)
      }
      cops = []
      scene.remove(group)
    },
  }
}
