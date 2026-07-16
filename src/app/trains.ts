import * as THREE from 'three'
import type { Railway, Vec2 } from '../geo/types'
import type { Circle } from '../physics/collide'
import type { ElevationProvider } from '../terrain/provider'

/** The three sorts of train, and how they're put together. */
export type TrainKind = 'freight' | 'intercity' | 'commuter' | 'tram'

interface Kind {
  cars: number
  len: number
  speed: number // m/s
  body: number
  roof: number
  windows: boolean
}

const KINDS: Record<TrainKind, Kind> = {
  freight: { cars: 12, len: 12, speed: 14, body: 0x7a4a32, roof: 0x5f3a26, windows: false },
  intercity: { cars: 7, len: 22, speed: 30, body: 0xd6dae0, roof: 0x9aa2ac, windows: true },
  commuter: { cars: 4, len: 18, speed: 20, body: 0x2f6f9a, roof: 0x24566f, windows: true },
  // Short, slow, and no locomotive: a tram is one carriage that drives itself.
  tram: { cars: 2, len: 14, speed: 11, body: 0xc8492f, roof: 0xdedad2, windows: true },
}
/** The heavy stuff, for lines of its own. */
const MAINLINE: TrainKind[] = ['freight', 'intercity', 'commuter']

/**
 * The rail ribbon is drawn at terrain + ROAD_Y_OFFSET (0.15); the wheels sit on
 * top of it. Anything else and the train floats over its own track.
 */
const RAIL_TOP = 0.15
const RAIL_Y = RAIL_TOP + 0.45 // axle height above the railhead
const MIN_LINE = 260 // metres of track needed before a train is worth running
const MIN_TRAM_LINE = 120 // a tram works a shorter run than an intercity

export interface Trains {
  update(dt: number, night: number): void
  /** Where the carriages are, for the player and the demo to reckon with. */
  obstacles(): Circle[]
  setEnabled(on: boolean): void
  /** Take them off the scene — the trains belong to one city's railways. */
  dispose(): void
}

/** Cumulative length of a polyline, for walking along it at a set speed. */
function measure(line: Vec2[]): number[] {
  const d = [0]
  for (let i = 1; i < line.length; i++) {
    d.push(d[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z))
  }
  return d
}

/**
 * Where you are, and which way you face, `s` metres along a line.
 *
 * `s` is clamped, not wrapped: wrapping teleports the train from one end of the
 * line to the other, and in view that reads as it vanishing.
 */
function at(line: Vec2[], cum: number[], s: number): { x: number; z: number; angle: number } {
  const total = cum[cum.length - 1]
  const t = s < 0 ? 0 : s > total ? total : s
  let i = 1
  while (i < cum.length - 1 && cum[i] < t) i++
  const a = line[i - 1]
  const b = line[i]
  const seg = cum[i] - cum[i - 1] || 1
  const f = (t - cum[i - 1]) / seg
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    angle: Math.atan2(b.z - a.z, b.x - a.x),
  }
}

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

/**
 * The locomotive: a long hood, a cab set back, a headlight and a horn. It leads
 * every train — a rake of identical wagons has nothing pulling it.
 */
function locomotive(k: Kind): THREE.Group {
  const g = new THREE.Group()
  const len = Math.max(16, k.len)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 3.1), mat(0x2a2c30))
  frame.position.y = RAIL_Y + 0.5
  g.add(frame)
  // Long hood forward, cab behind it — a diesel, read from the side.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(len * 0.55, 2.2, 2.7), mat(0x8f2f2f))
  hood.position.set(len * 0.16, RAIL_Y + 1.9, 0)
  g.add(hood)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(len * 0.24, 3, 3), mat(0x8f2f2f))
  cab.position.set(-len * 0.24, RAIL_Y + 2.3, 0)
  g.add(cab)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.26, 0.25, 3.1), mat(0x5f2020))
  roof.position.set(-len * 0.24, RAIL_Y + 3.9, 0)
  g.add(roof)
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2b36, flatShading: true })
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 2.6), glass)
  screen.position.set(-len * 0.12, RAIL_Y + 2.9, 0)
  g.add(screen)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(len * 0.1, 1.4, 2.5), mat(0x6f2424))
  nose.position.set(len * 0.46, RAIL_Y + 1.4, 0)
  g.add(nose)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x5a5a48, emissive: 0xfff2c0, emissiveIntensity: 0 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lampMat)
  lamp.position.set(len * 0.51, RAIL_Y + 2.1, 0)
  lamp.userData.trainLamp = true
  g.add(lamp)
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6), mat(0x2a2c30))
  stack.position.set(len * 0.16, RAIL_Y + 3.2, 0)
  g.add(stack)
  addBogies(g, len)
  return g
}

function addBogies(g: THREE.Group, len: number): void {
  for (const x of [len * 0.35, -len * 0.35]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), mat(0x2a2c30))
    bogie.position.set(x, RAIL_TOP + 0.45, 0)
    g.add(bogie)
    // Wheels, sitting on the railhead rather than hovering over it.
    for (const z of [1.1, -1.1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10), mat(0x15161a))
      w.rotation.x = Math.PI / 2
      w.position.set(x, RAIL_TOP + 0.45, z)
      g.add(w)
    }
  }
}

function carriage(k: Kind): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(k.len, 3.2, 3), mat(k.body))
  body.position.y = RAIL_Y + 1.9
  g.add(body)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(k.len * 0.96, 0.35, 2.9), mat(k.roof))
  roof.position.y = RAIL_Y + 3.6
  g.add(roof)
  if (k.windows) {
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1b2b36,
      emissive: 0xffd98a,
      emissiveIntensity: 0,
      flatShading: true,
    })
    for (const z of [1.52, -1.52]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(k.len * 0.8, 1, 0.06), glass)
      strip.position.set(0, RAIL_Y + 2.5, z)
      strip.userData.trainGlass = true
      g.add(strip)
    }
  }
  addBogies(g, k.len)
  return g
}

/**
 * Trains running the OSM railway lines.
 *
 * The lines were already parsed and drawn as bare ribbons; this walks a train
 * along one at a steady speed and loops it round. Only lines long enough to be
 * worth it get one — a 50m siding with an intercity on it looks absurd.
 */
export function createTrains(
  scene: THREE.Scene,
  railways: Railway[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): Trains {
  const group = new THREE.Group()
  scene.add(group)

  const running: { line: Vec2[]; cum: number[]; k: Kind; cars: THREE.Group[]; s: number; dir: number }[] = []

  for (const rail of railways) {
    const line = rail.points
    if (line.length < 2) continue
    const cum = measure(line)
    const total = cum[cum.length - 1]
    if (total < (rail.tram ? MIN_TRAM_LINE : MIN_LINE)) continue

    // Tram tracks run down the street. Putting an intercity on one drives a
    // full-length train through the traffic — a tram is the only thing that
    // belongs there.
    const kind: TrainKind = rail.tram ? 'tram' : MAINLINE[Math.floor(rand() * MAINLINE.length)]
    const k = KINDS[kind]
    const cars: THREE.Group[] = []
    for (let i = 0; i < k.cars; i++) {
      // A tram has no locomotive: every car is the same, and the first drives.
      const c = i === 0 && kind !== 'tram' ? locomotive(k) : carriage(k)
      group.add(c)
      cars.push(c)
    }
    running.push({ line, cum, k, cars, s: rand() * total, dir: rand() < 0.5 ? 1 : -1 })
  }

  const solidAt: Circle[] = []

  return {
    obstacles: () => solidAt,
    setEnabled(on) {
      group.visible = on
      if (!on) solidAt.length = 0
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
      })
      running.length = 0
      solidAt.length = 0
    },
    update(dt, night) {
      solidAt.length = 0
      for (const tr of running) {
        const total = tr.cum[tr.cum.length - 1]
        tr.s += tr.k.speed * dt * tr.dir
        // Run to the end of the line and come back, rather than jumping to the
        // start: the jump is visible, and a line that leaves the map has to end
        // somewhere anyway.
        const rake = (tr.k.cars - 1) * (tr.k.len + 1.2)
        if (tr.dir > 0 && tr.s > total) {
          tr.s = total
          tr.dir = -1
        } else if (tr.dir < 0 && tr.s < rake) {
          tr.s = rake
          tr.dir = 1
        }
        tr.cars.forEach((car, i) => {
          // Each carriage sits a car-length back along the same track, so the
          // whole train follows the curve instead of pivoting as one stick —
          // and 'back' is whichever way it happens to be running.
          const centre = tr.s - tr.dir * i * (tr.k.len + 1.2)
          const p = at(tr.line, tr.cum, centre)
          // Pitch to the grade: sample the track a half-carriage either side and
          // sit on the line between them, the way a bogie at each end would. A
          // carriage held level while the track climbs sinks into the hill at one
          // end and hangs off it at the other.
          const halfLen = tr.k.len / 2
          const back = at(tr.line, tr.cum, centre - halfLen)
          const front = at(tr.line, tr.cum, centre + halfLen)
          const yBack = provider.heightAt(back.x, back.z)
          const yFront = provider.heightAt(front.x, front.z)
          const run = Math.hypot(front.x - back.x, front.z - back.z) || 1

          car.position.set(p.x, (yBack + yFront) / 2, p.z)
          const facing = -(p.angle + (tr.dir < 0 ? Math.PI : 0)) // face the way it's going
          car.rotation.set(0, facing, 0)
          // Nose up when the track climbs ahead of us; the sign follows the
          // direction of travel, since the model's +x is its front.
          car.rotateZ(Math.atan2((yFront - yBack) * tr.dir, run))
          // A carriage is long; cover it with a couple of circles rather than
          // one, or you can drive through its middle.
          for (const along of [-0.25, 0.25]) {
            solidAt.push({
              x: p.x + Math.cos(p.angle) * tr.k.len * along,
              z: p.z + Math.sin(p.angle) * tr.k.len * along,
              r: 2.4,
            })
          }
          car.traverse((o) => {
            if (o.userData.trainGlass) {
              ;((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = night * 1.1
            } else if (o.userData.trainLamp) {
              ;((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = night * 2.5
            }
          })
        })
      }
    },
  }
}
