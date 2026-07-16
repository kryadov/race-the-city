import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import { SpatialGrid } from '../physics/grid'
import type { ElevationProvider } from '../terrain/provider'
import { createCar, stepCar, type CarInput, type CarState } from '../vehicle/car'
import { buildVehicleMesh } from '../vehicle/model'
import { VEHICLES, type VehicleSpec, type VehicleType } from '../vehicle/vehicles'
import { buildRoadGraph, type RoadGraph } from '../world/roadGraph'
import { findRoute } from '../world/route'
import { angleDelta } from './autopilot'

/** Close enough to a route node to call it reached, in metres. */
const ARRIVE_R = 6
/**
 * How many route nodes it may skip in one frame. A junction is a cluster of
 * vertices metres apart, all of them already inside ARRIVE_R at once — the same
 * reason `autopilot.ts` walks past the whole cluster rather than the next node.
 */
const MAX_SKIP = 12
/** Steering gain: how hard it corrects toward the target bearing. Autopilot's figure. */
const STEER_GAIN = 1.6
/** Close enough to a gate to have taken it. Matches REACH in `timeTrial.ts`. */
const GATE_REACH = 9
/** Metres between rivals on the grid, either side of the player. */
const SPAWN_GAP = 6

/**
 * The field. Each drives a different vehicle so you can tell who is who at a
 * glance in the mirror, and `cap` is the top speed in m/s it will hold — well
 * under what its spec could do, so a player who drives the gates well wins.
 */
const FIELD: readonly { type: VehicleType; cap: number }[] = [
  { type: 'sports', cap: 30 },
  { type: 'ev', cap: 26 },
  { type: 'minivan', cap: 22 },
]

export interface RaceState {
  /** The player's position, 1-based. */
  place: number
  /** How many are racing, the player included. */
  of: number
}

/** What ranking needs to know about a racer. */
export interface Runner {
  taken: number
  x: number
  z: number
}

export interface Rivals {
  enabled(): boolean
  setEnabled(on: boolean): void
  /**
   * @param grid the city's buildings. Taken here rather than at construction:
   *   `main.ts` replaces the grid wholesale when a city loads, so a rival
   *   holding the one from startup would be driving round an empty world and
   *   through every wall in this one.
   */
  reset(roads: Road[], grid: SpatialGrid, provider: ElevationProvider, car: CarState, course: Vec2[]): void
  update(dt: number, car: CarState, playerTaken: number, course: Vec2[]): RaceState
  dispose(): void
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * Where a racer stands: one plus however many are in front of it.
 *
 * Gates taken comes first and distance to the next one only splits a tie —
 * someone a lap ahead is ahead, however far past the gate they have driven.
 */
export function placeOf(you: Runner, rivals: Runner[], gate: Vec2 | null): number {
  let ahead = 0
  for (const r of rivals) {
    if (r.taken > you.taken) ahead++
    else if (r.taken === you.taken && gate && dist(r, gate) < dist(you, gate)) ahead++
  }
  return ahead + 1
}

interface Racer {
  car: CarState
  spec: VehicleSpec
  cap: number
  mesh: THREE.Group
  /** Node indices from `findRoute`, and how far along them it has walked. */
  route: number[]
  step: number
  /** Which gate of the course it is going for, and how many it has taken. */
  gate: number
  taken: number
}

/**
 * Three AI cars racing the player round the time trial's gates.
 *
 * A rival is a real `CarState` fed through `stepCar`: it steers, it slides and
 * it hits buildings, exactly as the player's car does. It follows an A* route
 * over the road graph to the gate it is chasing, so it drives the streets
 * rather than sliding through the city on a rail.
 */
export function createRivals(scene: THREE.Scene): Rivals {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)

  let on = false
  let height: ElevationProvider = { heightAt: () => 0 }
  let solid = new SpatialGrid([], 25)
  let graph: RoadGraph = { nodes: [], nearest: () => -1 }
  let racers: Racer[] = []

  /** A fresh route from where a rival is to the gate it is chasing. */
  const routeTo = (r: Racer, course: Vec2[]): void => {
    const gate = course[r.gate]
    r.route = []
    r.step = 0
    if (!gate || !graph.nodes.length) return
    r.route = findRoute(graph, graph.nearest(r.car.x, r.car.z), graph.nearest(gate.x, gate.z))
  }

  const drive = (r: Racer, dt: number, course: Vec2[]): void => {
    const gate = course[r.gate]
    if (gate && dist(r.car, gate) < GATE_REACH) {
      r.taken++
      r.gate = (r.gate + 1) % course.length
      routeTo(r, course)
    }

    for (let i = 0; i < MAX_SKIP; i++) {
      const node = graph.nodes[r.route[r.step]]
      if (!node || dist(node, r.car) >= ARRIVE_R) break
      r.step++
    }

    // The route runs out, or never existed: the gate is on an island this rival
    // cannot reach by road. Steer straight at it rather than stand still — it
    // will not get there, but a parked rival looks broken and a driving one does
    // not, and the next gate may well be back on its own island.
    const aim = graph.nodes[r.route[r.step]] ?? course[r.gate]
    if (!aim) return

    const err = angleDelta(r.car.heading, Math.atan2(aim.z - r.car.z, aim.x - r.car.x))
    const speed = Math.hypot(r.car.vx, r.car.vz)
    const input: CarInput = {
      throttle: speed > r.cap ? 0 : 1,
      steer: Math.max(-1, Math.min(1, err * STEER_GAIN)),
      brake: false,
    }
    r.car = stepCar(r.car, input, dt, solid, height, r.spec)
  }

  const show = (r: Racer): void => {
    r.mesh.position.set(r.car.x, r.car.y, r.car.z)
    // Negated, and nothing else: a vehicle model's nose is its local +x, and a
    // +y rotation swings +x toward -z while a +heading turns toward +z. This is
    // the player's convention in `scene.ts` and the traffic's in `traffic.ts`,
    // flattened — a rival has no terrain basis, it just sits on its wheels.
    r.mesh.rotation.y = -r.car.heading
  }

  return {
    enabled: () => on,
    setEnabled(v) {
      on = v
      group.visible = v
    },
    reset(roads, buildings, prov, car, course) {
      height = prov
      solid = buildings
      graph = buildRoadGraph(roads)
      // The meshes are the expensive part and never change: build them once and
      // put them back on the grid on every reset. `dispose` is what frees them.
      if (!racers.length) {
        racers = FIELD.map((f) => {
          const mesh = buildVehicleMesh(f.type)
          group.add(mesh)
          return {
            car: createCar(),
            spec: VEHICLES[f.type],
            cap: f.cap,
            mesh,
            route: [],
            step: 0,
            gate: 0,
            taken: 0,
          }
        })
      }

      // Line up alongside the player, on the road nearest each slot: the player's
      // right is (-sin, cos) of the heading, so this puts one either side and one
      // on the player's shoulder.
      const rx = -Math.sin(car.heading)
      const rz = Math.cos(car.heading)
      racers.forEach((r, i) => {
        const off = (i - 1) * SPAWN_GAP
        const slot = { x: car.x + rx * off, z: car.z + rz * off }
        const node = graph.nodes[graph.nearest(slot.x, slot.z)] ?? slot
        r.car = createCar(node.x, node.z)
        r.car.y = height.heightAt(node.x, node.z)
        const gate = course[0]
        r.car.heading = gate
          ? Math.atan2(gate.z - r.car.z, gate.x - r.car.x)
          : car.heading
        r.gate = 0
        r.taken = 0
        routeTo(r, course)
        show(r)
      })
    },
    update(dt, car, playerTaken, course) {
      if (!on) return { place: 1, of: 1 }
      for (const r of racers) {
        drive(r, dt, course)
        show(r)
      }
      const you = { taken: playerTaken, x: car.x, z: car.z }
      return {
        place: placeOf(you, racers.map((r) => ({ taken: r.taken, x: r.car.x, z: r.car.z })), course[playerTaken] ?? null),
        of: racers.length + 1,
      }
    },
    dispose() {
      for (const r of racers) {
        r.mesh.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.geometry) m.geometry.dispose()
          const mat = m.material
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
        })
        group.remove(r.mesh)
      }
      racers = []
      scene.remove(group)
    },
  }
}
