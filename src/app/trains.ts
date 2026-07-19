import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Railway, Road, Vec2 } from '../geo/types'
import type { Circle } from '../physics/collide'
import { RAILHEAD_Y } from '../world/roads'
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
  tram: { cars: 2, len: 11, speed: 11, body: 0xd8dde2, roof: 0x2f6f9a, windows: true },
}
/** The heavy stuff, for lines of its own. */
const MAINLINE: TrainKind[] = ['freight', 'intercity', 'commuter']

/**
 * The height of the railhead, taken from the track builder rather than guessed:
 * the wheels sit on it, and anything else floats the train over its own rails.
 */
const RAIL_TOP = RAILHEAD_Y
const RAIL_Y = RAIL_TOP + 0.45 // axle height above the railhead
const MIN_LINE = 260 // metres of track needed before a train is worth running
const MIN_TRAM_LINE = 120 // a tram works a shorter run than an intercity
/** Height of a tunnel mouth's opening, in metres — clears the tallest carriage. */
const PORTAL_MOUTH = 5
/** How near a train must come to a crossing before its booms drop, in metres. */
const CROSS_WARN = 80
/** Most level crossings to gate — a handful the player meets, nearest first. */
const MAX_CROSSINGS = 12
/** Two crossing points nearer than this are the one crossing (parallel tracks). */
const CROSS_MERGE = 12
/** Boom travel: flat across the road (down) and lifted just shy of vertical (up). */
const BOOM_DOWN = 0.06
const BOOM_UP = 1.45
/** How fast the boom sweeps, per second — a framerate-independent ease rate. */
const BOOM_EASE = 2.6

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

/**
 * How close a line comes to the middle of the map, in metres.
 *
 * The projector puts the city centre at the origin and that is where you start,
 * so this is how far you would have to drive to meet whatever runs on it.
 */
function middleGap(rail: { points: Vec2[] }): number {
  let best = Infinity
  for (const p of rail.points) best = Math.min(best, Math.hypot(p.x, p.z))
  return best
}

/**
 * Where two segments cross, or null if they don't.
 *
 * The usual parametric solve: both `t` and `u` have to land in [0,1] for the hit
 * to sit on the two segments themselves rather than on the endless lines through
 * them. A near-zero denominator is a parallel or degenerate pair — no crossing.
 */
function segCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const rx = b.x - a.x
  const rz = b.z - a.z
  const sx = d.x - c.x
  const sz = d.z - c.z
  const denom = rx * sz - rz * sx
  if (Math.abs(denom) < 1e-9) return null
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / denom
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a.x + rx * t, z: a.z + rz * t }
}

/**
 * Level crossings, taken as the points where two DISTINCT non-tunnel railway
 * lines cross at grade, each with the bearing of the track running through it.
 *
 * A level crossing is where a drivable ROAD meets the rails at grade, so we cross
 * every road segment against every railway segment (bridge/tunnel ways skipped —
 * those are grade-separated, not crossings). We stand the booms there, squared
 * across the road. Two roads meeting a bundle of parallel tracks close together
 * throws off a cluster of near-identical points, so those are merged; then the
 * lot is taken nearest-the-middle first and capped — the same reasoning that runs
 * the trains where you start rather than at the far corner of four square km.
 *
 * Cost is a one-off at construction, not per frame: a bounding-box reject skips
 * any pair of lines that cannot overlap before their segments are ever compared.
 */
function findCrossings(roads: Road[], rails: Railway[]): { at: Vec2; dir: Vec2 }[] {
  const railLines = rails.filter((r) => !r.tunnel && r.points.length >= 2)
  const roadLines = roads.filter((r) => !r.tunnel && !r.bridge && r.points.length >= 2)
  if (!railLines.length || !roadLines.length) return []
  const bbox = (pts: Vec2[]): { minX: number; maxX: number; minZ: number; maxZ: number } => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    return { minX, maxX, minZ, maxZ }
  }
  const rbox = railLines.map((l) => bbox(l.points))
  const found: { at: Vec2; dir: Vec2 }[] = []
  for (const road of roadLines) {
    const rb = bbox(road.points)
    for (let j = 0; j < railLines.length; j++) {
      const jb = rbox[j]
      if (rb.maxX < jb.minX || jb.maxX < rb.minX || rb.maxZ < jb.minZ || jb.maxZ < rb.minZ) continue
      const A = road.points // road segments
      const B = railLines[j].points // rail segments
      for (let a = 1; a < A.length; a++) {
        for (let b = 1; b < B.length; b++) {
          const hit = segCross(A[a - 1], A[a], B[b - 1], B[b])
          if (!hit) continue
          if (found.some((f) => Math.hypot(f.at.x - hit.x, f.at.z - hit.z) < CROSS_MERGE)) continue
          const dx = A[a].x - A[a - 1].x // the ROAD's direction through the crossing
          const dz = A[a].z - A[a - 1].z
          const len = Math.hypot(dx, dz) || 1
          // Stored so the barrier build recovers the road direction: it reads
          // road = (-dir.z, dir.x), so dir = (roadDir.z, -roadDir.x).
          found.push({ at: hit, dir: { x: dz / len, z: -dx / len } })
        }
      }
    }
  }
  found.sort((p, q) => Math.hypot(p.at.x, p.at.z) - Math.hypot(q.at.x, q.at.z))
  return found.slice(0, MAX_CROSSINGS)
}

/**
 * A tunnel mouth, for the ends of a line.
 *
 * OSM lines stop at the edge of the map, or wherever the mapper stopped, so a
 * train reaching the end had nowhere to be. Giving it a portal to come out of
 * and go into is the cheap honest answer: the line ends somewhere either way,
 * and a tunnel is somewhere.
 *
 * @param angle the bearing of the track here, radians
 */
function portal(angle: number): THREE.Group {
  const g = new THREE.Group()
  const W = 8
  const H = 6.5
  // The face, with the hole in it built as four blocks rather than a hole: a
  // low-poly wall with a gap costs four boxes and no CSG.
  const stone = mat(0x6d6a63)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, W), stone)
  lintel.position.set(0, PORTAL_MOUTH + 1, 0)
  g.add(lintel)
  for (const side of [1, -1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, PORTAL_MOUTH, 2.4), stone)
    pier.position.set(0, PORTAL_MOUTH / 2, side * 2.8)
    g.add(pier)
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, W + 0.8), mat(0x5a5750))
  cap.position.set(0, H, 0)
  g.add(cap)
  // The dark behind the mouth: a train that has gone in has gone somewhere.
  const dark = new THREE.Mesh(new THREE.BoxGeometry(3, PORTAL_MOUTH, 5.2), mat(0x0a0a0c))
  dark.position.set(-1.6, PORTAL_MOUTH / 2, 0)
  g.add(dark)
  g.rotation.y = -angle
  g.userData.portal = true // not a carriage: the tests count what moves
  return g
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

/**
 * A tram carriage: low floor, a rounded end, a livery band, doors, and a
 * pantograph on the roof. A pair of plain red boxes reads as freight on a
 * street, which is what it looked like.
 */
function tramCar(k: Kind, first: boolean): THREE.Group {
  const g = new THREE.Group()
  const FLOOR = RAIL_TOP + 0.35 // low-floor: that is what a tram looks like
  const H = 2.7
  const body = new THREE.Mesh(new THREE.BoxGeometry(k.len, H, 2.4), mat(k.body))
  body.position.y = FLOOR + H / 2
  g.add(body)
  // Rounded cab end, on the leading car only.
  if (first) {
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 10, 1, false, -Math.PI / 2, Math.PI), mat(k.body))
    nose.rotation.x = Math.PI / 2
    nose.rotation.z = -Math.PI / 2
    nose.position.set(k.len / 2, FLOOR + 1.35, 0)
    g.add(nose)
  }
  // Livery band along the waist — trams are two-tone, never one flat colour.
  const band = new THREE.Mesh(new THREE.BoxGeometry(k.len * 0.99, 0.42, 2.46), mat(k.roof))
  band.position.y = FLOOR + 0.55
  g.add(band)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(k.len * 0.96, 0.22, 2.3), mat(0xb8bec6))
  roof.position.y = FLOOR + H + 0.05
  g.add(roof)
  // Glazing: a row of separate windows each side (not one long strip), plus the
  // cab's screen. The panes on both sides are one merged mesh; the doors are
  // their own boxes over the band below them.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1b2b36,
    emissive: 0xffd98a,
    emissiveIntensity: 0,
    flatShading: true,
  })
  const win = new THREE.Mesh(windowBand(k.len * 0.82, FLOOR + 1.75, 1.22, 1.1), glass)
  win.userData.trainGlass = true
  g.add(win)
  for (const z of [1.22, -1.22]) {
    // Doors, in the dark of the band.
    for (const x of [k.len * 0.28, -k.len * 0.28]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.06), mat(0x3f4a55))
      door.position.set(x, FLOOR + 1.0, z * 1.01)
      g.add(door)
    }
  }
  if (first) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 2.0), glass)
    screen.position.set(k.len / 2 + 1.15, FLOOR + 1.75, 0)
    screen.userData.trainGlass = true
    g.add(screen)
    const lamp = new THREE.MeshStandardMaterial({ color: 0x5a5a48, emissive: 0xfff2c0, emissiveIntensity: 0 })
    for (const z of [0.75, -0.75]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.4), lamp)
      l.position.set(k.len / 2 + 1.18, FLOOR + 0.5, z)
      l.userData.trainLamp = true
      g.add(l)
    }
  }
  // Pantograph: the one thing that says 'electric tram' at a glance. It trails —
  // the arm rises TOWARD THE BACK, away from the way the tram is going, which is
  // how a single-arm pantograph is run so the wire cannot catch under the knuckle.
  // The model's nose is its local +x and the leading car always leads, whichever
  // end of the line it is running to, so this is right in both directions.
  const pan = new THREE.Group()
  const armA = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), mat(0x33363d))
  armA.rotation.z = -0.5
  armA.position.y = 0.35
  pan.add(armA)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 1.6), mat(0x33363d))
  bar.position.set(-0.62, 0.7, 0)
  bar.userData.pantographBar = true
  pan.add(bar)
  pan.position.set(-k.len * 0.2, FLOOR + H + 0.16, 0)
  g.add(pan)

  addBogies(g, k.len)
  return g
}

/**
 * A row of separate windows down BOTH sides of a car, as one merged geometry.
 *
 * The old glazing was a single box `len*0.8` long: one unbroken ribbon of glass
 * running the whole carriage, which no real coach has — read from the side it was
 * a stripe, not windows. This lays out evenly spaced panes with body-coloured
 * pillars left between them; the gaps ARE the pillars — we simply don't put glass
 * there, so the body colour shows through. Both sides' panes are merged into a
 * SINGLE BufferGeometry with a single material, so however many windows a car
 * grows it is still one mesh and one draw — cheaper than the two strips it
 * replaces, and O(cars) overall.
 *
 * @param span length of car the window band occupies, metres (centred on x=0)
 * @param y    centre height of the band
 * @param half half-width to each side; panes go at z = +half and z = -half
 * @param winH pane height
 */
function windowBand(span: number, y: number, half: number, winH: number): THREE.BufferGeometry {
  const pitch = 1.9 // one window + its pillar, metres — a coach-window rhythm
  const n = Math.max(3, Math.round(span / pitch))
  const cell = span / n
  const winW = cell * 0.68 // the remaining third of each cell is the pillar
  const panes: THREE.BufferGeometry[] = []
  for (const z of [half, -half]) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(winW, winH, 0.06)
      g.translate(-span / 2 + cell * (i + 0.5), y, z)
      panes.push(g)
    }
  }
  return mergeGeometries(panes)
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
    // A row of panes down each side, lit as one at night (see the update loop),
    // rather than a single strip the length of the car.
    const win = new THREE.Mesh(windowBand(k.len * 0.8, RAIL_Y + 2.5, 1.52, 1), glass)
    win.userData.trainGlass = true
    g.add(win)
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
  maxTrains = 8,
  roads: Road[] = [], // drivable roads, so boom barriers can stand at road/rail crossings
): Trains {
  const group = new THREE.Group()
  scene.add(group)

  const running: { line: Vec2[]; cum: number[]; k: Kind; cars: THREE.Group[]; s: number; dir: number }[] = []

  // Every line worth running something on, trams kept apart from the mainline.
  const trams: Railway[] = []
  const mainlines: Railway[] = []
  for (const rail of railways) {
    // A tunnelled line is underground. A train on it would be driving through
    // the buildings above it — which is exactly what Monaco did.
    if (rail.tunnel) continue
    if (rail.points.length < 2) continue
    const cum = measure(rail.points)
    const total = cum[cum.length - 1]
    if (total < (rail.tram ? MIN_TRAM_LINE : MIN_LINE)) continue
    ;(rail.tram ? trams : mainlines).push(rail)
  }

  // Nearest the middle first. There are only a handful of trains for a whole
  // city, and taking the list in the order OSM happened to give it scattered
  // them anywhere in four square kilometres — you drive over rail after rail and
  // never meet a thing on any of it. You start at the middle, so that is where
  // they should be running.
  const nearMiddle = (a: Railway, b: Railway): number => middleGap(a) - middleGap(b)
  trams.sort(nearMiddle)
  mainlines.sort(nearMiddle)

  // Alternate between the two, tram first, rather than taking the list in order
  // until the count runs out. `parse.ts` emits every mainline line before the
  // first tram, so in order meant the mainline took every slot: Prague has 52
  // tram ways and never ran a single tram. The tram is also the one you actually
  // meet — it comes down the street you are driving on — so it leads.
  const picked: Railway[] = []
  for (let i = 0; picked.length < maxTrains && (i < trams.length || i < mainlines.length); i++) {
    if (i < trams.length) picked.push(trams[i])
    if (picked.length < maxTrains && i < mainlines.length) picked.push(mainlines[i])
  }

  for (const rail of picked) {
    const line = rail.points
    const cum = measure(line)
    const total = cum[cum.length - 1]

    // Tram tracks run down the street. Putting an intercity on one drives a
    // full-length train through the traffic — a tram is the only thing that
    // belongs there.
    const kind: TrainKind = rail.tram ? 'tram' : MAINLINE[Math.floor(rand() * MAINLINE.length)]
    const k = KINDS[kind]
    const cars: THREE.Group[] = []
    for (let i = 0; i < k.cars; i++) {
      // A tram has no locomotive: the leading car has the cab and drives.
      const c = kind === 'tram' ? tramCar(k, i === 0) : i === 0 ? locomotive(k) : carriage(k)
      group.add(c)
      cars.push(c)
    }
    running.push({ line, cum, k, cars, s: rand() * total, dir: rand() < 0.5 ? 1 : -1 })

    // A mouth at each end for it to come out of and go into. The bearing is the
    // track's own at that end, and the far one faces back down the line.
    const ends: [Vec2, number][] = [
      [line[0], Math.atan2(line[1].z - line[0].z, line[1].x - line[0].x) + Math.PI],
      [
        line[line.length - 1],
        Math.atan2(
          line[line.length - 1].z - line[line.length - 2].z,
          line[line.length - 1].x - line[line.length - 2].x,
        ),
      ],
    ]
    for (const [at, angle] of ends) {
      const p = portal(angle)
      p.position.set(at.x, provider.heightAt(at.x, at.z), at.z)
      group.add(p)
    }
  }

  // Boom barriers at the level crossings. Each crossing gets two hinged booms,
  // one on either side of the tracks, that this loop keeps a handle on so the
  // update loop can drop and raise them. Empty when nothing crosses, and the
  // whole thing is skipped then — most cities have a crossing or two, not none.
  const barriers: { arms: THREE.Group[]; at: Vec2; t: number }[] = []
  const crossings = findCrossings(roads, railways)
  if (crossings.length) {
    // Every boom is the same striped bar, so its geometry is built once here and
    // clones of it hang at each crossing: a dozen barriers stay a few small
    // buffers. The bar runs from the pivot (x=0) out along +x in six equal
    // stripes, the odd ones red and the even white, merged per colour into two
    // meshes; a stub counterweight sits behind the pivot, and a post holds it up.
    const BOOM_LEN = 6
    const cell = BOOM_LEN / 6
    const reds: THREE.BufferGeometry[] = []
    const whites: THREE.BufferGeometry[] = []
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.BoxGeometry(cell, 0.16, 0.16)
      seg.translate(cell * (i + 0.5), 0, 0)
      ;(i % 2 ? whites : reds).push(seg)
    }
    const redGeo = mergeGeometries(reds)
    const whiteGeo = mergeGeometries(whites)
    const redMat = mat(0xc0392b)
    const whiteMat = mat(0xecf0f1)
    const postGeo = new THREE.BoxGeometry(0.3, 1.4, 0.3)
    const postMat = mat(0x4a4f57)
    const weightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.3)
    const OFFSET = 6.5 // how far each post stands back from the tracks, metres
    const PIVOT_Y = 1.3 // the hinge height the bar swings about, above the post base
    for (const c of crossings) {
      // `dir` was stored so this recovers the ROAD's own direction; a post stands
      // beside the crossing on each side, and the boom drops square across the road.
      const road = { x: -c.dir.z, z: c.dir.x }
      const arms: THREE.Group[] = []
      for (const side of [1, -1]) {
        const px = c.at.x + road.x * OFFSET * side
        const pz = c.at.z + road.z * OFFSET * side
        const mount = new THREE.Group()
        mount.position.set(px, provider.heightAt(px, pz), pz)
        // Face the boom's +x back across the road, toward the tracks, so both
        // booms lie over the crossing when down and nearly meet in the middle.
        const inx = -road.x * side
        const inz = -road.z * side
        mount.rotation.y = Math.atan2(-inz, inx)
        const post = new THREE.Mesh(postGeo, postMat)
        post.position.y = 0.7
        mount.add(post)
        const arm = new THREE.Group()
        arm.position.y = PIVOT_Y
        arm.add(new THREE.Mesh(redGeo, redMat))
        arm.add(new THREE.Mesh(whiteGeo, whiteMat))
        const weight = new THREE.Mesh(weightGeo, postMat)
        weight.position.x = -0.4
        arm.add(weight)
        arm.rotation.z = BOOM_UP // starts raised: the road is open until a train comes
        mount.add(arm)
        mount.userData.barrier = true // not a carriage: the tests count what moves
        group.add(mount)
        arms.push(arm)
      }
      barriers.push({ arms, at: c.at, t: 0 }) // t eases 0 (up) .. 1 (down)
    }
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
      barriers.length = 0
    },
    update(dt, night) {
      solidAt.length = 0
      for (const tr of running) {
        const total = tr.cum[tr.cum.length - 1]
        tr.s += tr.k.speed * dt * tr.dir
        // Run to the end of the line and come back, rather than jumping to the
        // start: the jump is visible, and a line that leaves the map has to end
        // somewhere anyway.
        // Run right out of the line and come back. The train may sit entirely
        // beyond either end: that is the tunnel, and the carriages out there are
        // simply not drawn.
        const rake = (tr.k.cars - 1) * (tr.k.len + 1.2)
        if (tr.dir > 0 && tr.s > total + rake) {
          tr.s = total + rake
          tr.dir = -1
        } else if (tr.dir < 0 && tr.s < -rake) {
          tr.s = -rake
          tr.dir = 1
        }
        tr.cars.forEach((car, i) => {
          // Each carriage sits a car-length back along the same track, so the
          // whole train follows the curve instead of pivoting as one stick —
          // and 'back' is whichever way it happens to be running.
          const centre = tr.s - tr.dir * i * (tr.k.len + 1.2)
          // Off the end of the line is inside the tunnel. `at` CLAMPS, so
          // without this every carriage that has not emerged yet is piled on the
          // first point of the track — and they drive out of one another one by
          // one, which is exactly what it looked like.
          car.visible = centre >= 0 && centre <= total
          if (!car.visible) return
          const p = at(tr.line, tr.cum, centre)
          // Orient from the two points the car actually rests on — a half-carriage
          // ahead and behind its centre, where its bogies sit — rather than from
          // the single segment the centre happens to lie on. `at().angle` is that
          // segment's own bearing, so it SNAPPED by the whole turn the instant the
          // centre crossed a vertex, and the grade jerked the same way at a hump.
          // Sampling the ends and orienting along the line between them spreads a
          // bend across the ~carriage length it takes the car to round it, so the
          // body banks and pitches through the curve instead of hinging at each
          // vertex — the flow a rigid coach on two trucks has. Stateless, so it
          // stays deterministic and costs the same two extra samples it always did.
          const halfLen = tr.k.len / 2
          const back = at(tr.line, tr.cum, centre - halfLen)
          const front = at(tr.line, tr.cum, centre + halfLen)
          const yBack = provider.heightAt(back.x, back.z)
          const yFront = provider.heightAt(front.x, front.z)
          const run = Math.hypot(front.x - back.x, front.z - back.z) || 1
          const tang = Math.atan2(front.z - back.z, front.x - back.x)

          // A carriage held level while the track climbs sinks into the hill at one
          // end and hangs off it at the other; sitting it on the line between the
          // two sampled ends pitches it to the grade.
          car.position.set(p.x, (yBack + yFront) / 2, p.z)
          const facing = -(tang + (tr.dir < 0 ? Math.PI : 0)) // face the way it's going
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
      // Boom barriers: drop when a train is bearing down on the crossing, lift
      // once the line is clear. Gated on there being any crossing at all, then
      // O(crossings × trains) — a handful each, so a few dozen distance checks.
      // The ease is framerate-independent (an exponential approach with `dt` in
      // the exponent), so the bar sweeps smoothly and never snaps, whatever the
      // frame time; `t` runs 0 (up) to 1 (down) and both booms follow it.
      if (barriers.length) {
        const k = 1 - Math.exp(-BOOM_EASE * dt)
        for (const bar of barriers) {
          let near = false
          for (const tr of running) {
            const head = at(tr.line, tr.cum, tr.s)
            if (Math.hypot(head.x - bar.at.x, head.z - bar.at.z) < CROSS_WARN) {
              near = true
              break
            }
          }
          bar.t += ((near ? 1 : 0) - bar.t) * k
          const ang = BOOM_UP + (BOOM_DOWN - BOOM_UP) * bar.t
          for (const arm of bar.arms) arm.rotation.z = ang
        }
      }
    },
  }
}
