import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'
import { bayLines, ringAngle } from '../world/parking'
import { collectParkedCars, makeRng, SEED as PARKED_SEED } from '../world/parkedCars'

// A living car park isn't a frozen showroom: a FEW of its cars come alive. Each
// animated car sits in its bay, drives slowly out to the lot's exit point and
// fades away, waits a beat, then fades back in at the exit and drives to a bay.
// EVERYTHING happens inside the lot polygon — the bay is inside it (bayLines
// rejects any that aren't) and the exit point is nudged just inside the ring, so
// a straight lerp between the two never leaves the tarmac and a car can never
// drive into a building. The bulk of a lot stays STATIC (see parkedCars.ts); this
// is a small separate pool of individual moving meshes.

/** No more than a handful of animated cars across the whole map. */
const GLOBAL_CAP = 12
/** And no single lot runs more than a couple. */
const PER_LOT_CAP = 2
/** Slow — a car nosing in and out of a bay, metres per second. */
const SPEED = 2.5
/** Seconds parked in a bay, before it pulls out (randomised per car). */
const DWELL_MIN = 8
const DWELL_MAX = 22
/** Seconds the bay stands empty before another car fades in (randomised). */
const GAP_MIN = 5
const GAP_MAX = 12
/** Clamp on a leg's duration, so a long lot doesn't crawl and a short one doesn't jump. */
const TRAVEL_MIN = 3
const TRAVEL_MAX = 14
/** A bay this close (m) to a statically-parked car is taken — leave it be. */
const BAY_CLEAR = 2.5
/** How far inside the ring the exit point sits, in metres, so it reads as the lot's
 *  mouth toward the road (nearest the origin) yet stays reliably inside the polygon. */
const EXIT_INSET = 2
/** Least bay→exit distance worth animating, in metres — closer than this reads as a twitch. */
const MIN_TRAVEL_DIST = 4
/** Seconds at the START of PARKED a figure spends getting out and walking off. */
const ALIGHT_T = 2.5
/** Seconds at the END of PARKED a figure spends walking up and getting in. */
const BOARD_T = 2.5
/** Least dead time between the alight and board windows — a walker is only built
 *  if the dwell is comfortably longer than both windows plus this gap. */
const WALKER_GAP = 1
/** How far from the bay, toward the lot interior, the figure walks — metres. */
const KERB_DIST = 3
/** Clothes for the little figures — a plain enough spread. */
const CLOTH = [0x3a6ea5, 0x8f4a4a, 0x4a6b4a, 0x6b5a7a, 0x555b62, 0xb0b6bd]
/** Body colours a car park is full of — silver, white, grey, black, the odd colour. */
const PALETTE = [
  0x2c3e50, 0xb0b6bd, 0xe8eef2, 0x1c1f26, 0x8a1c1c,
  0x27496d, 0x3a5a40, 0xd9b23a, 0x7a7f87, 0xcdd3d8,
]

// Car dimensions, matching the low-poly parked-car look (parkedCars.ts) so an
// animated car is cut from the same cloth as the static ones it moves among.
const CAR_W = 1.9
const CAR_H = 0.7
const CAR_L = 4.4
const BODY_Y = 0.66
const CABIN_W = 1.6
const CABIN_H = 0.5
const CABIN_L = 2.2
const CABIN_Y = 1.16
const WHEEL_R = 0.33
const WHEEL_W = 0.22
const HALF_TRACK = CAR_W / 2 - WHEEL_W / 2
const HALF_BASE = 1.3
const LAMP_W = 0.3
const LAMP_H = 0.16
const LAMP_D = 0.08
const LAMP_Y = 0.6
const HALF_LAMP = CAR_W / 2 - 0.35

export interface LivingParking {
  update(dt: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** The four phases of a bay's life. */
export type Phase = 'parked' | 'leaving' | 'empty' | 'arriving'

/**
 * A car's state machine, as plain numbers so it's pure and testable. `clock` is
 * the time spent so far in the current phase; the three durations are fixed per
 * car (randomised at birth). A leaving/arriving leg runs for `travel`; a parked
 * dwell for `dwell`; an empty gap for `gap`.
 */
export interface Cycle {
  phase: Phase
  clock: number
  dwell: number
  travel: number
  gap: number
}

/** The phases in order — parked → leaving → empty → arriving → parked. */
function nextPhase(p: Phase): Phase {
  switch (p) {
    case 'parked': return 'leaving'
    case 'leaving': return 'empty'
    case 'empty': return 'arriving'
    case 'arriving': return 'parked'
  }
}

/** How long the current phase lasts. */
function phaseDuration(c: Cycle): number {
  switch (c.phase) {
    case 'parked': return c.dwell
    case 'leaving': return c.travel
    case 'empty': return c.gap
    case 'arriving': return c.travel
  }
}

/**
 * Advance a car's cycle by `dt` (pure). Time that overruns the current phase is
 * carried into the next, so a big step can cross several phases and the loop
 * lands on the phase and remainder it should — the same result you'd get from
 * many small steps. Durations are always positive, so the loop terminates.
 */
export function advanceCycle(c: Cycle, dt: number): Cycle {
  let phase = c.phase
  let clock = c.clock + dt
  for (let guard = 0; guard < 10000; guard++) {
    const dur = phaseDuration({ ...c, phase })
    if (clock < dur) break
    clock -= dur
    phase = nextPhase(phase)
  }
  return { ...c, phase, clock }
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
const legT = (c: Cycle): number => clamp01(c.travel > 0 ? c.clock / c.travel : 1)

/**
 * Where the car sits this instant, on the straight line between its bay and the
 * lot's exit point (pure). Parked at the bay, leaving lerps bay→exit, arriving
 * lerps exit→bay, empty waits at the exit. Every result lies on the bay↔exit
 * segment, which is chosen to stay inside the lot — so the car never leaves it.
 */
export function cyclePosition(c: Cycle, bay: Vec2, exit: Vec2): Vec2 {
  switch (c.phase) {
    case 'parked': return { x: bay.x, z: bay.z }
    case 'empty': return { x: exit.x, z: exit.z }
    case 'leaving': {
      const t = legT(c)
      return { x: bay.x + (exit.x - bay.x) * t, z: bay.z + (exit.z - bay.z) * t }
    }
    case 'arriving': {
      const t = legT(c)
      return { x: exit.x + (bay.x - exit.x) * t, z: exit.z + (bay.z - exit.z) * t }
    }
  }
}

/**
 * How opaque the car is this instant (pure): solid while parked, gone while
 * empty, fading out over the last of the leaving leg and in over the first of
 * the arriving leg — so it dissolves as it reaches the exit and materialises
 * there again, rather than winking on and off.
 */
export function cycleOpacity(c: Cycle): number {
  switch (c.phase) {
    case 'parked': return 1
    case 'empty': return 0
    case 'leaving': {
      const t = legT(c)
      return t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)
    }
    case 'arriving': {
      const t = legT(c)
      return t < 0.3 ? t / 0.3 : 1
    }
  }
}

/** A walker figure's pose this instant: whether it's on show, where, and how solid. */
export interface Walk {
  visible: boolean
  pos: Vec2
  opacity: number
}

/**
 * The figure that gets in and out of an animated car (pure). It only appears in
 * two short windows of the PARKED phase, and is hidden otherwise:
 *
 * - ALIGHTING — the first `ALIGHT_T` seconds: someone steps out at the car (bay)
 *   and walks to the kerb point, fading out as they arrive (they've gone).
 * - BOARDING — the last `BOARD_T` seconds (clock > dwell − BOARD_T): someone
 *   fades in at the kerb and walks to the car (bay), where they board — so the
 *   car pulls away occupied when LEAVING begins.
 *
 * The figure stays on the straight bay↔kerb segment, which is inside the lot, so
 * it can never clip a building. Hidden entirely during leaving/empty/arriving.
 */
export function walkerState(c: Cycle, bay: Vec2, kerb: Vec2): Walk {
  if (c.phase === 'parked') {
    if (c.clock < ALIGHT_T) {
      const t = clamp01(c.clock / ALIGHT_T)
      return {
        visible: true,
        pos: { x: bay.x + (kerb.x - bay.x) * t, z: bay.z + (kerb.z - bay.z) * t },
        opacity: t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4), // fades out as it reaches the kerb
      }
    }
    if (c.clock > c.dwell - BOARD_T) {
      const u = clamp01((c.clock - (c.dwell - BOARD_T)) / BOARD_T)
      return {
        visible: true,
        pos: { x: kerb.x + (bay.x - kerb.x) * u, z: kerb.z + (bay.z - kerb.z) * u },
        opacity: u < 0.4 ? u / 0.4 : 1, // fades in at the kerb, solid by the car
      }
    }
  }
  return { visible: false, pos: { x: bay.x, z: bay.z }, opacity: 0 }
}

/**
 * A fixed kerb point for a bay: a few metres from the bay toward the lot's
 * interior (its centroid), where the figure alights to / boards from. Clamped so
 * it can't overshoot the centroid, and verified INSIDE the polygon — returns null
 * if no safe point is found (a gnarly lot shape) or the walk would be too short
 * to read, in which case the caller simply gives that car no walker.
 */
export function kerbPoint(bay: Vec2, ring: Vec2[]): Vec2 | null {
  const c = centroid(ring)
  const dx = c.x - bay.x
  const dz = c.z - bay.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-3) return null
  const step = Math.min(KERB_DIST, len * 0.8) // don't walk past the middle of the lot
  if (step < 1.5) return null // too short a stroll to bother with
  const k = { x: bay.x + (dx / len) * step, z: bay.z + (dz / len) * step }
  return pointInPolygon(k.x, k.z, ring) ? k : null
}

/** Nearest point on segment ab to the origin. */
function closestToOrigin(a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const len2 = abx * abx + abz * abz || 1
  let t = -(a.x * abx + a.z * abz) / len2
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + abx * t, z: a.z + abz * t }
}

/** The centroid of a ring's vertices — an interior anchor to nudge the exit toward. */
function centroid(ring: Vec2[]): Vec2 {
  let x = 0
  let z = 0
  for (const p of ring) {
    x += p.x
    z += p.z
  }
  return { x: x / ring.length, z: z / ring.length }
}

/**
 * The lot's exit point: the point on its ring nearest the map origin (its mouth
 * toward the city and its roads), nudged a couple of metres inward toward the
 * centroid so it sits reliably INSIDE the polygon rather than exactly on the
 * boundary. A fixed per-lot point — no randomness, so it's the same every reload.
 */
export function exitPoint(ring: Vec2[]): Vec2 {
  let best: Vec2 = ring[0]
  let bestD = Infinity
  for (let i = 0; i < ring.length; i++) {
    const p = closestToOrigin(ring[i], ring[(i + 1) % ring.length])
    const d = p.x * p.x + p.z * p.z
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  const c = centroid(ring)
  const dx = c.x - best.x
  const dz = c.z - best.z
  const len = Math.hypot(dx, dz) || 1
  const step = Math.min(EXIT_INSET, len)
  return { x: best.x + (dx / len) * step, z: best.z + (dz / len) * step }
}

/** Is the whole straight run from `bay` to `exit` inside the lot polygon? */
function pathInside(bay: Vec2, exit: Vec2, ring: Vec2[]): boolean {
  const STEPS = 10
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const x = bay.x + (exit.x - bay.x) * t
    const z = bay.z + (exit.z - bay.z) * t
    if (!pointInPolygon(x, z, ring)) return false
  }
  return true
}

interface AnimCar {
  mesh: THREE.Group
  mats: THREE.Material[]
  bay: Vec2
  exit: Vec2
  cycle: Cycle
  /** rotation.y facing along the bay's depth when parked (matches static cars). */
  parkYaw: number
  /** rotation.y pointing bay→exit (the way it pulls out); arriving faces the reverse. */
  outYaw: number
  /** The figure that gets in/out, and where it walks to — null when the lot shape
   *  left no safe kerb point, in which case this car simply has no walker. */
  walker: THREE.Group | null
  walkerMats: THREE.Material[]
  kerb: Vec2 | null
}

const mat = (c: number): THREE.MeshStandardMaterial =>
  // Transparent so a fade ramps its opacity; flat-shaded to match the low-poly world.
  new THREE.MeshStandardMaterial({ color: c, flatShading: true, transparent: true })

/**
 * A single low-poly car as an individual (non-instanced) mesh — a coloured body,
 * a dark cabin, four wheels and head/tail lamp dabs, authored with y = 0 at the
 * tyres so a position drop seats it on the tarmac. Every material is collected so
 * `update` can fade the whole car together.
 */
function buildCar(tint: number): { group: THREE.Group; mats: THREE.Material[] } {
  const group = new THREE.Group()
  const mats: THREE.Material[] = []
  const add = (geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial): void => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.frustumCulled = false // it moves; an off-screen bounding box must not cull it
    group.add(mesh)
    mats.push(m)
  }

  add(new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L).translate(0, BODY_Y, 0), mat(tint))
  add(new THREE.BoxGeometry(CABIN_W, CABIN_H, CABIN_L).translate(0, CABIN_Y, 0), mat(0x14171f))

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheelMat = mat(0x111114)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = wheelGeo.clone().translate(sx * HALF_TRACK, WHEEL_R, sz * HALF_BASE)
      const mesh = new THREE.Mesh(w, wheelMat)
      mesh.frustumCulled = false
      group.add(mesh)
    }
  }
  wheelGeo.dispose() // the clones carry the real geometry; the template is spent
  mats.push(wheelMat)

  const lamp = (zEnd: number, colour: number): void => {
    const lm = mat(colour)
    for (const sx of [-1, 1]) {
      const d = new THREE.BoxGeometry(LAMP_W, LAMP_H, LAMP_D).translate(sx * HALF_LAMP, LAMP_Y, zEnd)
      const mesh = new THREE.Mesh(d, lm)
      mesh.frustumCulled = false
      group.add(mesh)
    }
    mats.push(lm)
  }
  lamp(CAR_L / 2, 0xf3eccf) // pale front pair (+z is the nose)
  lamp(-CAR_L / 2, 0x8e1a12) // red rear pair

  return { group, mats }
}

/**
 * A little low-poly figure (~1.6m) — two legs, a torso, two arms and a head, cut
 * from the same cloth as the pedestrians (see pedestrians.ts). Authored with the
 * feet at y = 0 so a position drop stands it on the ground, facing +z. Every
 * material is collected so it can be faded in and out with the walk.
 */
function buildWalker(cloth: number): { group: THREE.Group; mats: THREE.Material[] } {
  const group = new THREE.Group()
  const mats: THREE.Material[] = []
  const clothMat = mat(cloth)
  const legMat = mat(0x33363d) // dark trousers
  const skinMat = mat(0xe0ac69)
  mats.push(clothMat, legMat, skinMat)
  const add = (geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial): void => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.frustumCulled = false // it moves; an off-screen bounding box must not cull it
    group.add(mesh)
  }
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.16, 0.75, 0.18).translate(sx * 0.11, 0.375, 0), legMat)
    add(new THREE.BoxGeometry(0.11, 0.5, 0.12).translate(sx * 0.28, 1.05, 0), clothMat)
  }
  add(new THREE.BoxGeometry(0.42, 0.6, 0.26).translate(0, 1.05, 0), clothMat) // torso
  add(new THREE.SphereGeometry(0.15, 6, 5).translate(0, 1.5, 0), skinMat) // head
  return { group, mats }
}

/**
 * A handful of parking lots come alive: cars drive in, park, dwell and drive out
 * again, so a car park reads as active rather than frozen. All motion is a slow
 * straight lerp between a bay and the lot's fixed exit point, both inside the lot
 * polygon, so no car ever drives into a building.
 *
 * A small separate pool of individual moving meshes — the bulk of the lot's cars
 * stay static (parkedCars.ts). Capped globally and per lot, with animated bays
 * chosen away from the statically-parked ones so no two cars share a space.
 */
export function createLivingParking(
  scene: THREE.Scene,
  parking: Vec2[][],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): LivingParking {
  const group = new THREE.Group()
  scene.add(group)
  group.userData.neonMover = 'bot' // neon flips it to wireframe like the road traffic

  const cars: AnimCar[] = []
  // The exact static set buildParkedCars draws (same fixed seed), so an animated
  // car never claims a bay a parked car is already sitting in.
  const staticCars = collectParkedCars(parking, makeRng(PARKED_SEED))
  const taken = (b: Vec2): boolean =>
    staticCars.some((s) => Math.hypot(s.x - b.x, s.z - b.z) < BAY_CLEAR)

  const rng = rand // a seeded stream from the caller keeps the layout stable across reloads
  const rand2 = (lo: number, hi: number): number => lo + rng() * (hi - lo)

  for (const ring of parking) {
    if (cars.length >= GLOBAL_CAP || ring.length < 3) continue
    const bays = bayLines(ring)
    if (bays.length < 1) continue
    const exit = exitPoint(ring)
    const parkYaw = -ringAngle(ring)
    // Free bays with a worthwhile, wholly-in-lot run to the exit — farthest first,
    // so the animated cars are the ones with the most visible travel.
    const usable = bays
      .filter((b) => !taken(b))
      .filter((b) => Math.hypot(b.x - exit.x, b.z - exit.z) >= MIN_TRAVEL_DIST)
      .filter((b) => pathInside(b, exit, ring))
      .sort((a, b) => Math.hypot(b.x - exit.x, b.z - exit.z) - Math.hypot(a.x - exit.x, a.z - exit.z))

    let inLot = 0
    for (const bay of usable) {
      if (cars.length >= GLOBAL_CAP || inLot >= PER_LOT_CAP) break
      inLot++
      const { group: carMesh, mats } = buildCar(PALETTE[Math.floor(rng() * PALETTE.length)])
      carMesh.userData.livingKind = 'car'
      const dist = Math.hypot(bay.x - exit.x, bay.z - exit.z)
      const travel = Math.max(TRAVEL_MIN, Math.min(TRAVEL_MAX, dist / SPEED))
      // A random starting phase and offset, so the cars aren't all in lock-step.
      const phases: Phase[] = ['parked', 'leaving', 'empty', 'arriving']
      const cycle: Cycle = {
        phase: phases[Math.floor(rng() * phases.length)],
        clock: 0,
        dwell: rand2(DWELL_MIN, DWELL_MAX),
        travel,
        gap: rand2(GAP_MIN, GAP_MAX),
      }
      cycle.clock = rng() * phaseDuration(cycle) // start part-way through that phase
      const outYaw = Math.atan2(exit.x - bay.x, exit.z - bay.z)
      group.add(carMesh)
      // A figure gets in/out during PARKED — but only if the dwell is comfortably
      // longer than the two windows AND the lot shape yields a safe in-lot kerb
      // point. Either failing simply means this car has no walker (still a valid car).
      const kerb = cycle.dwell > ALIGHT_T + BOARD_T + WALKER_GAP ? kerbPoint(bay, ring) : null
      let walker: THREE.Group | null = null
      let walkerMats: THREE.Material[] = []
      if (kerb) {
        const built = buildWalker(CLOTH[Math.floor(rng() * CLOTH.length)])
        walker = built.group
        walker.userData.livingKind = 'walker'
        walkerMats = built.mats
        group.add(walker)
      }
      cars.push({ mesh: carMesh, mats, bay, exit, cycle, parkYaw, outYaw, walker, walkerMats, kerb })
    }
  }

  // Seat everyone at their opening pose, so the first frame is right even before
  // any time has passed (an EMPTY car starts hidden, a PARKED one in its bay).
  const seat = (c: AnimCar): void => {
    const p = cyclePosition(c.cycle, c.bay, c.exit)
    const op = cycleOpacity(c.cycle)
    c.mesh.visible = op > 0.001
    for (const m of c.mats) m.opacity = op
    c.mesh.position.set(p.x, provider.heightAt(p.x, p.z), p.z)
    c.mesh.rotation.y =
      c.cycle.phase === 'leaving' ? c.outYaw
      : c.cycle.phase === 'arriving' ? c.outYaw + Math.PI
      : c.parkYaw
    // The figure getting in/out, on the bay↔kerb line inside the lot. Its position
    // is always kept on that (in-lot) segment even while hidden, so it can never be
    // caught sitting outside the polygon.
    if (c.walker && c.kerb) {
      const w = walkerState(c.cycle, c.bay, c.kerb)
      c.walker.visible = w.visible && w.opacity > 0.001
      for (const m of c.walkerMats) m.opacity = w.opacity
      c.walker.position.set(w.pos.x, provider.heightAt(w.pos.x, w.pos.z), w.pos.z)
      // Face the way it's walking: out to the kerb while alighting, back to the
      // car while boarding (the last window of PARKED).
      const boarding = c.cycle.clock > c.cycle.dwell - BOARD_T
      const from = boarding ? c.kerb : c.bay
      const to = boarding ? c.bay : c.kerb
      c.walker.rotation.y = Math.atan2(to.x - from.x, to.z - from.z)
    }
  }
  for (const c of cars) seat(c)

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mm = m.material
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
      })
      cars.length = 0
    },
    update(dt) {
      for (const c of cars) {
        c.cycle = advanceCycle(c.cycle, dt)
        seat(c)
      }
    },
  }
}
