import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

export interface Birds {
  update(dt: number, camX: number, camZ: number, carX: number, carZ: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** A flock this size reads as birds; one bird crossing the sky reads as a bug. */
const COUNT = 8

/**
 * Cruising height, metres, for the ordinary low pass over rooftops and
 * treetops. Picked for the chase camera, not for realism: a real bird
 * soaring at 32m was almost never inside the frustum, because the chase
 * camera sits low and behind the car and pitches down at it (see syncCamera
 * in scene.ts) — its sky window barely clears the horizon. Flying at rooftop
 * height, close to the car, is what actually lands in shot.
 */
const ALT_LOW = 17
const ALT_VARY = 4 // per-bird height offset, so the flock isn't a flat disc
const ALT_BOB = 1.2 // slow rise and fall, so level flight doesn't look painted on
/**
 * How high a "climb away" leg reaches. Still well under the lowest aircraft
 * (the helicopter, at 70m — see aircraft.ts) so the two never share a layer
 * of sky.
 */
const ALT_CLIMB = 52
const CLIMB_CHANCE = 0.3 // fraction of outbound legs that climb instead of staying low
const CLIMB_EXTRA_LEN = 60 // a climbing leg also runs longer, to give the arc room

/** Straight-line flight: how far a cruise leg covers, and how fast. */
const LEG_LEN_MIN = 110
const LEG_LEN_MAX = 220
const CRUISE_SPEED = 9 // m/s
/**
 * How far a bird climbs out along its heading while it leaves the perch, and
 * how far it glides in while it lands — metres.
 *
 * Nothing alive goes straight up or straight down. It rose like a lift and its
 * landing was a lerp to a point, so it dropped: "как будто падают на землю как
 * листья". A bird trades height for distance at both ends.
 */
const CLIMB_OUT = 22
const GLIDE_IN = 34
/**
 * How far a leg bends, in radians of heading across the whole cruise. A bird
 * does not fly a ruled line — a lazy arc is the difference between a flight path
 * and a projectile.
 */
const LEG_BEND = 0.9

/** Vertical liftoff from a perch, and the touchdown that follows a leg. */
const TAKEOFF_DUR = 3 // seconds, perch to cruising altitude
const LAND_SPEED = 14 // m/s, sets how long the final approach takes
const LAND_DUR_MIN = 3
const LAND_DUR_MAX = 9

/** How long a bird stays down before its next flight. */
const PERCH_MIN = 8
const PERCH_MAX = 20
/**
 * A wave leaves within this many seconds of each other — enough that eight
 * birds don't flip state in perfect unison, tight enough that the flight
 * line doesn't string them out across the sky one by one. Flock, not queue.
 */
const STAGGER_MAX = 2.5
/** How wide to scatter a recycled bird's fresh perch around the player, metres. */
const RESEED_SPREAD = 160

/**
 * The flock's shared anchor wanders its own slow circle while chasing the
 * camera — holding position would look like a decal stuck on the sky — the
 * way traffic and pedestrians recycle around the camera rather than existing
 * city-wide. It is not itself a bird's position; it is where new flights are
 * planned from and where landings are re-aimed, so however far a leg's fixed
 * path drifts from the player, the flock always comes back down close by.
 */
const DRIFT_RADIUS = 45
const DRIFT_SPEED = 0.08 // rad/s
const FOLLOW_RATE = 1.0 // how eagerly the anchor closes on the camera, per second
/** Hard cap on anchor-to-camera distance, however far or fast the camera jumps. */
const LEASH_MAX = 90
/**
 * Past this from the camera a bird is recycled to a fresh perch near the player,
 * in metres — whatever it was doing.
 *
 * You drive at 20-40m/s and a bird flies at 9. Without this you outrun the whole
 * flock within seconds and never see one again: the anchor kept up, but the
 * birds only consult it when they land, which is a cycle away. Traffic and
 * pedestrians have recycled around the player from the start; birds were the
 * odd ones out.
 */
const FAR = 260

/** How far from the shared flight line each bird sits — a formation, not a stack. */
const FORMATION_SPREAD = 3.5

/**
 * Per-bird scatter of the landing point itself, as a multiple of the bird's
 * formation offset. The flock used to aim every landing at one spot near the
 * player and pile up on it — fine as flat diamonds, a heap once the birds grew
 * bodies. Each bird now aims a little way off, so on open ground they spread out
 * to land; near trees they still snap to a canopy, where a cluster reads fine.
 */
const PERCH_SCATTER = 3

/**
 * A car this close to a perched bird flushes it: it springs up at once and flees
 * straight away from the car instead of waiting out its rest. Measured to the
 * bird's rendered spot, not the shared perch it hangs off.
 */
const FLUSH_RADIUS = 22
const FLUSH_R2 = FLUSH_RADIUS * FLUSH_RADIUS

/** How far a perch search looks from the anchor for a tree to land in. */
const PERCH_SEARCH_RADIUS = 220
/** Rough canopy height a landed bird sits at, metres above the ground below it. */
const TREE_PERCH_H = 4.5
/** Clearance above bare ground, so a grounded bird doesn't clip into it. */
const GROUND_PERCH_H = 0.3
/** Clearance above a rooftop — a bird stands right on the surface, not on a canopy. */
const ROOF_PERCH_H = 0.3

const FLAP_SPEED_MIN = 7 // rad/s
const FLAP_SPEED_MAX = 11
const FLAP_AMPLITUDE = 0.85 // radians: a shallow shiver doesn't read as a flap

/**
 * Grounded look. A perched bird is not a flying one holding still: its wings
 * fold in against the body instead of staying spread — spread wings on the
 * ground read as a flat diamond ("выглядят плоско") — the body sits plumper,
 * and it gains the head, neck and tail a distant flying silhouette does
 * without. All of it is only ever drawn perched; in the air it folds away to
 * nothing (zero scale), so takeoff and cruise are left exactly as they were.
 * The body geometry is shared across the whole flock, so every difference from
 * the flight shape is a per-instance transform, not a second mesh.
 */
const WING_FOLD = 0.7 // radians the wings tuck up against the body when grounded
const GROUND_WING_SCALE = new THREE.Vector3(1, 1, 0.55) // span pulled in — a closed wing, not an open one
const GROUND_BODY_SCALE = new THREE.Vector3(0.9, 1.35, 1.0) // shorter and rounder than the flight spindle
// Head, neck and tail placement, in body-local metres — local +x is the way the
// bird faces, +y is up.
const HEAD_FWD = 1.05 // how far ahead of body-centre the head rests
const HEAD_UP = 0.5 // how high it rides — the neck's worth of lift
const NECK_LEN = 0.55
const NECK_MID_FWD = 0.78 // the neck stub sits at the shoulder-to-head midpoint
const NECK_MID_UP = 0.3
const NECK_TILT = 0.9 // radians the neck leans forward, shoulder up to head
const TAIL_BACK = 1.2 // how far behind body-centre the tail roots
const TAIL_UP = 0.2
const TAIL_TILT = 0.5 // radians the tail cocks up off flat

/**
 * Grounded motion. Small and slow on purpose — a bird pottering about, not a
 * frantic one. Every term is a pure function of `time` and the bird's own fixed
 * phases, exactly the way the flap and the altitude bob already are, so nothing
 * accumulates frame to frame, no two birds move in step, and there is no
 * per-frame randomness.
 */
const GROUND_TURN = 0.9 // radians the heading swings either side as it looks about
const GROUND_TURN_SLOW = 0.5 // rad/s of the main look-around
const GROUND_TURN_FIDGET = 0.17 // rad/s of the smaller twitch over it — incommensurate, so it never just ticks to and fro
const GAIT_SPEED = 2.0 // rad/s of the step-and-bob cycle
const STEP_ROCK = 0.6 // metres the body shuffles forward along its facing and back — a step in place
const HOP_HEIGHT = 0.35 // metres the body lifts on each step
const PECK_WINDOW = 0.35 // rad/s of the slow gate that opens now and then for a bout of pecking
const PECK_RATE = 5 // rad/s of the quick head dips within a bout
const PECK_DROP = 0.3 // metres the head drops at the bottom of a peck
const PECK_REACH = 0.15 // metres the head reaches forward as it dips

/** A muted flock palette: silhouettes against the sky, not parrots. */
const COLORS = [0x2a2a2c, 0x3a3632, 0x232526, 0x46403a]

/** Ground height of 0 everywhere, for the flock that exists before any city
 *  (and its terrain) has loaded. */
const FLAT_GROUND: ElevationProvider = { heightAt: () => 0 }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * Nearest perch to (x, z) within PERCH_SEARCH_RADIUS, or null if the list is
 * empty or nothing is close enough. Linear scan: called a couple of times a
 * minute per bird, not per frame, so a list of a few hundred trees is nothing.
 */
function findPerch(x: number, z: number, perches: Vec2[]): Vec2 | null {
  let best: Vec2 | null = null
  let bestD2 = PERCH_SEARCH_RADIUS * PERCH_SEARCH_RADIUS
  for (const s of perches) {
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = s
    }
  }
  return best
}

/**
 * One triangle per wing, hinged at the shared root vertex (the body). Two of
 * these, instanced per bird and animated apart, is the cheapest shape that
 * still reads as a bird — a flat triangle is a glider, a hinge that opens and
 * closes is a wingbeat.
 *
 * Sized well past a real songbird, the way aircraft.ts oversizes airliners:
 * true-to-life, a bird flying low over a rooftop is still only a few pixels
 * and may as well not be there.
 */
function wingGeometry(mirror: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const tip: [number, number, number] = [-0.5, 0, mirror * 1.2]
  const trail: [number, number, number] = [-1.0, 0, mirror * 0.35]
  // Winding kept the same handedness on both the right wing and its mirror,
  // or the left wing's face normal would point into the ground.
  const verts = mirror > 0 ? [0, 0, 0, ...tip, ...trail] : [0, 0, 0, ...trail, ...tip]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * The bird's body — a low-poly spindle the wings hinge on. Two flat triangles
 * with nothing between them read as a paper dart, not a bird ("выглядят плоско,
 * это отвратительно"); a body gives them volume. A faceted octahedron stretched
 * long and slim keeps the game's low-poly, flat-shaded look, and is symmetric
 * front-to-back and side-to-side so it reads right whichever way heading points
 * it — no dependence on the wing frame's z-sign.
 */
function bodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(1, 0)
  geo.scale(1.5, 0.42, 0.42) // long along travel (x), slim in section — a body, not a ball
  return geo
}

/**
 * The head — a small, slightly squashed low-poly ball that rides up front on
 * the neck of a grounded bird, the detail a distant flying silhouette does
 * without. An icosahedron at zero subdivision is twenty flat faces: round
 * enough to read as a head, cheap enough to give every bird in the flock.
 */
function headGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.45, 0)
  geo.scale(0.95, 0.85, 0.85) // a touch longer than tall — a head, not a marble
  return geo
}

/**
 * The neck — a short, thin stub that carries the head clear of the shoulders,
 * so a perched bird reads as head-up-on-a-neck rather than headless. A
 * five-sided prism is the cheapest thing that doesn't obviously square off.
 */
function neckGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.13, 0.16, NECK_LEN, 5, 1)
}

/**
 * The tail — one flat triangle fanning out behind the body. A single triangle
 * is all a tail needs at this distance; the fold of the wings and the lift of
 * the head carry the rest of the perched silhouette.
 */
function tailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  // Root at the body (origin), widening to a fork at the back — local -x is aft.
  const verts = [0, 0, 0, -0.9, 0, 0.4, -0.9, 0, -0.4]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

type State = 'perched' | 'takeoff' | 'cruise' | 'landing'

interface Bird {
  state: State
  stateT: number // seconds spent in the current state

  // Fixed per-bird look: not re-rolled between flights.
  ox: number
  oz: number // a small, constant offset from the shared line/perch — a formation, not a stack
  altOffset: number
  bobPhase: number
  bobSpeed: number
  flapPhase: number
  flapSpeed: number
  stagger: number // this bird's fixed lag behind the rest of the wave

  // The perch a bird currently occupies, or is heading for. Core coordinates:
  // ox/oz are added only at render time.
  perchX: number
  perchY: number
  perchZ: number

  // This bird's current (or most recent) outbound leg — copied out of the
  // shared plan at takeoff so a later bird replanning mid-flight can't reach
  // back and change a leg already underway.
  legHeading: number
  /** How far this leg's heading swings across the cruise, radians. */
  legBend: number
  legClimb: boolean
  legLen: number
  cruiseDur: number

  // Snapshots taken at each state's start, so its motion is a pure function
  // of stateT and doesn't accumulate error frame to frame.
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  landDur: number
}

/**
 * A flock of birds with somewhere to be: they lift off a perch, fly a
 * straight leg across the sky near the player — sometimes low over the
 * rooftops, sometimes climbing away high — and come back down to settle,
 * on the ground or in a tree, until the next flight.
 *
 * @param provider ground height for landings. Defaults to flat ground at
 *   y=0, for the flock that exists before any city has loaded.
 * @param perches candidate tree spots a bird may land in (world.trees is
 *   the natural source). Empty by default: birds land on the ground alone.
 * @param roofAt height of the roof under (x, z), or null over open ground —
 *   e.g. `(x, z) => roofUnder(x, z, grid)` from physics/collide.ts. Optional:
 *   without it, a bird just never finds a roof to land on.
 */
export function createBirds(
  scene: THREE.Scene,
  rand: () => number = Math.random,
  count = COUNT,
  provider: ElevationProvider = FLAT_GROUND,
  perches: Vec2[] = [],
  roofAt?: (x: number, z: number) => number | null,
): Birds {
  const group = new THREE.Group()
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({
    flatShading: true,
    side: THREE.DoubleSide, // seen from below as often as from above
    // The sky dome and aircraft both skip the fog for the same reason (see
    // aircraft.ts): the fog runs 300..900m by distance from the camera, but
    // this is a thing in clear air, not haze in front of it — a bird out
    // near the leash edge would otherwise wash out grey.
    fog: false,
  })
  const n = Math.max(1, count)
  const body = new THREE.InstancedMesh(bodyGeometry(), mat, n)
  const rightWing = new THREE.InstancedMesh(wingGeometry(1), mat, n)
  const leftWing = new THREE.InstancedMesh(wingGeometry(-1), mat, n)
  // Grounded-only detail: added after the body and wings so their child indices
  // (0..2) stay put, and folded to a point (zero scale) whenever a bird is airborne.
  const head = new THREE.InstancedMesh(headGeometry(), mat, n)
  const neck = new THREE.InstancedMesh(neckGeometry(), mat, n)
  const tail = new THREE.InstancedMesh(tailGeometry(), mat, n)
  group.add(body, rightWing, leftWing, head, neck, tail)
  /**
   * Instance colours only — NOT vertexColors (see traffic.ts). Neither wing
   * geometry carries a colour attribute, so vertexColors would paint every
   * bird black before instanceColor is ever applied.
   */
  // The flock is always near the player and constantly moving, and three only
  // computes an InstancedMesh's bounding sphere once (see traffic.ts) — so
  // without this the whole flock gets frustum-culled as one the moment it
  // drifts from wherever that first sphere happened to land.
  body.frustumCulled = false
  rightWing.frustumCulled = false
  leftWing.frustumCulled = false
  head.frustumCulled = false
  neck.frustumCulled = false
  tail.frustumCulled = false

  const birds: Bird[] = []
  const col = new THREE.Color()
  for (let i = 0; i < n; i++) {
    birds.push({
      state: 'perched',
      stateT: 0,
      ox: (rand() - 0.5) * 2 * FORMATION_SPREAD,
      oz: (rand() - 0.5) * 2 * FORMATION_SPREAD,
      altOffset: (rand() - 0.5) * 2 * ALT_VARY,
      bobPhase: rand() * Math.PI * 2,
      bobSpeed: 0.5 + rand() * 0.5,
      flapPhase: rand() * Math.PI * 2,
      flapSpeed: FLAP_SPEED_MIN + rand() * (FLAP_SPEED_MAX - FLAP_SPEED_MIN),
      stagger: rand() * STAGGER_MAX,
      perchX: 0,
      perchY: 0,
      perchZ: 0,
      legHeading: rand() * Math.PI * 2,
      legBend: 0,
      legClimb: false,
      legLen: 0,
      cruiseDur: 1,
      fromX: 0,
      fromY: 0,
      fromZ: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      landDur: 1,
    })
    col.setHex(COLORS[Math.floor(rand() * COLORS.length)])
    body.setColorAt(i, col)
    rightWing.setColorAt(i, col)
    leftWing.setColorAt(i, col)
    head.setColorAt(i, col)
    neck.setColorAt(i, col)
    tail.setColorAt(i, col)
  }
  if (body.instanceColor) body.instanceColor.needsUpdate = true
  if (rightWing.instanceColor) rightWing.instanceColor.needsUpdate = true
  if (leftWing.instanceColor) leftWing.instanceColor.needsUpdate = true
  if (head.instanceColor) head.instanceColor.needsUpdate = true
  if (neck.instanceColor) neck.instanceColor.needsUpdate = true
  if (tail.instanceColor) tail.instanceColor.needsUpdate = true

  let time = 0
  let driftAngle = rand() * Math.PI * 2
  let anchorX = 0
  let anchorZ = 0
  let started = false

  /**
   * The leg every bird currently taking off shares, so a flock flies one
   * direction at a time instead of eight. Cleared once nothing is left
   * flying it, so the next bird to leave its perch rolls a fresh one.
   */
  let plan: { heading: number; climb: boolean; legLen: number; cruiseDur: number; bend: number } | null = null
  /**
   * How long the flock rests before its next flight, shared by the whole
   * wave (each bird adds its own small stagger on top) — rolled fresh once
   * everyone has landed, from PERCH_MIN..PERCH_MAX.
   */
  let restDur = PERCH_MIN

  const m = new THREE.Matrix4()
  const qHeading = new THREE.Quaternion()
  const qFlap = new THREE.Quaternion()
  const qTotal = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  // Fixed forward leans for the neck stub and the cocked-up tail, and scratch
  // objects for placing the grounded head/neck/tail each frame.
  const qNeckTilt = new THREE.Quaternion().setFromAxisAngle(zAxis, -NECK_TILT)
  const qTailTilt = new THREE.Quaternion().setFromAxisAngle(zAxis, -TAIL_TILT)
  const partQuat = new THREE.Quaternion()
  const off = new THREE.Vector3()
  const partPos = new THREE.Vector3()
  const zeroScale = new THREE.Vector3(0, 0, 0)

  /**
   * A landing spot near (x, z): a nearby tree if one is close, else the roof
   * directly below the search point if there is one, else the ground.
   */
  function pickLanding(x: number, z: number): { x: number; y: number; z: number } {
    const spot = findPerch(x, z, perches)
    if (spot) return { x: spot.x, y: provider.heightAt(spot.x, spot.z) + TREE_PERCH_H, z: spot.z }
    const roofY = roofAt?.(x, z) ?? null
    if (roofY !== null) return { x, y: roofY + ROOF_PERCH_H, z }
    return { x, y: provider.heightAt(x, z) + GROUND_PERCH_H, z }
  }

  function settle(b: Bird): void {
    b.perchX = b.toX
    b.perchY = b.toY
    b.perchZ = b.toZ
    b.state = 'perched'
    b.stateT = 0
    // Free the shared plan and roll a fresh rest once nothing else is still
    // flying, so the next departure is a new wave — a new direction, not
    // every bird repeating the last leg forever.
    if (!birds.some((o) => o !== b && (o.state === 'takeoff' || o.state === 'cruise'))) {
      plan = null
      restDur = PERCH_MIN + rand() * (PERCH_MAX - PERCH_MIN)
    }
  }

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      body.geometry.dispose()
      rightWing.geometry.dispose()
      leftWing.geometry.dispose()
      head.geometry.dispose()
      neck.geometry.dispose()
      tail.geometry.dispose()
      mat.dispose()
      birds.length = 0
    },
    update(dt, camX, camZ, carX, carZ) {
      if (!started) {
        // Start on top of the player rather than easing in from wherever the
        // anchor's zero value happened to be — otherwise the flock's first
        // sighting is it flying in from the map origin.
        anchorX = camX
        anchorZ = camZ
        started = true
        restDur = PERCH_MIN + rand() * (PERCH_MAX - PERCH_MIN)
        for (const b of birds) {
          const spot = pickLanding(camX + (rand() - 0.5) * 30, camZ + (rand() - 0.5) * 30)
          b.perchX = spot.x
          b.perchY = spot.y
          b.perchZ = spot.z
          // stateT starts at 0, same as after any other landing: the whole
          // flock rests together and leaves as one wave (offset only by its
          // own small stagger) — not scattered across a full rest period's
          // worth of desync on the very first cycle.
        }
      }
      time += dt
      driftAngle += DRIFT_SPEED * dt
      const targetX = camX + Math.cos(driftAngle) * DRIFT_RADIUS
      const targetZ = camZ + Math.sin(driftAngle) * DRIFT_RADIUS
      const closeFrac = Math.min(1, FOLLOW_RATE * dt)
      anchorX += (targetX - anchorX) * closeFrac
      anchorZ += (targetZ - anchorZ) * closeFrac
      // However fast or far the camera jumps (a city change teleports it),
      // the anchor must never be left visibly behind — a hard leash on top
      // of the chase, not just a slower catch-up that could lose the race.
      const dx = anchorX - camX
      const dz = anchorZ - camZ
      const dist = Math.hypot(dx, dz)
      if (dist > LEASH_MAX) {
        const s = LEASH_MAX / dist
        anchorX = camX + dx * s
        anchorZ = camZ + dz * s
      }

      for (let i = 0; i < n; i++) {
        const b = birds[i]
        b.stateT += dt

        // Outrun: put it back where it can be seen. A bird flies at 9m/s and you
        // drive at four times that, so without this the flock is behind you
        // within seconds and stays there — it only ever consults the anchor when
        // it lands, and that is a cycle away.
        if (b.state !== 'perched' || b.stateT < restDur) {
          const away = Math.hypot(b.perchX - camX, b.perchZ - camZ)
          if (away > FAR) {
            const spot = pickLanding(
              camX + (rand() - 0.5) * RESEED_SPREAD,
              camZ + (rand() - 0.5) * RESEED_SPREAD,
            )
            b.perchX = spot.x
            b.perchY = spot.y
            b.perchZ = spot.z
            b.state = 'perched'
            b.stateT = rand() * restDur // don't launch the whole flock at once
          }
        }

        if (b.state === 'perched') {
          // A car bearing down flushes the bird: up at once, fleeing away from it.
          const rx = b.perchX + b.ox
          const rz = b.perchZ + b.oz
          const spooked = (rx - carX) * (rx - carX) + (rz - carZ) * (rz - carZ) < FLUSH_R2
          if (spooked || b.stateT >= restDur + b.stagger) {
            if (!plan) {
              const climb = rand() < CLIMB_CHANCE
              const legLen = LEG_LEN_MIN + rand() * (LEG_LEN_MAX - LEG_LEN_MIN) + (climb ? CLIMB_EXTRA_LEN : 0)
              plan = {
                heading: rand() * Math.PI * 2,
                climb,
                legLen,
                cruiseDur: legLen / CRUISE_SPEED,
                bend: (rand() * 2 - 1) * LEG_BEND,
              }
            }
            const leg = plan
            // Startled birds break away from the car; unhurried ones follow the plan.
            b.legHeading = spooked ? Math.atan2(rz - carZ, rx - carX) : leg.heading
            b.legClimb = leg.climb
            b.legLen = leg.legLen
            b.cruiseDur = leg.cruiseDur
            b.legBend = leg.bend
            b.fromX = b.perchX
            b.fromY = b.perchY
            b.fromZ = b.perchZ
            b.toX = b.perchX
            b.toY = ALT_LOW + b.altOffset
            b.toZ = b.perchZ
            b.state = 'takeoff'
            b.stateT = 0
          }
        } else if (b.state === 'takeoff') {
          if (b.stateT >= TAKEOFF_DUR) {
            b.fromX = b.toX + Math.cos(b.legHeading) * CLIMB_OUT
            b.fromY = b.toY
            b.fromZ = b.toZ + Math.sin(b.legHeading) * CLIMB_OUT
            b.state = 'cruise'
            b.stateT = 0
          }
        } else if (b.state === 'cruise') {
          if (b.stateT >= b.cruiseDur) {
            // Re-aim at the player, not at wherever the leg's fixed path
            // ended up: the camera has been moving the whole flight, and the
            // one thing that must land near it is the landing itself.
            const endMean = b.legHeading + b.legBend * 0
            const legEndX = b.fromX + Math.cos(endMean) * b.legLen
            const legEndZ = b.fromZ + Math.sin(endMean) * b.legLen
            const land = pickLanding(anchorX + b.ox * PERCH_SCATTER, anchorZ + b.oz * PERCH_SCATTER)
            b.fromX = legEndX
            b.fromY = ALT_LOW + b.altOffset
            b.fromZ = legEndZ
            b.toX = land.x
            b.toY = land.y
            b.toZ = land.z
            const d = Math.hypot(b.toX - b.fromX, b.toZ - b.fromZ)
            b.landDur = Math.min(LAND_DUR_MAX, Math.max(LAND_DUR_MIN, d / LAND_SPEED))
            b.state = 'landing'
            b.stateT = 0
          }
        } else if (b.state === 'landing') {
          if (b.stateT >= b.landDur) settle(b)
        }

        // Position: a pure function of state + stateT, so nothing here
        // accumulates drift frame to frame.
        let coreX: number, coreY: number, coreZ: number, heading: number
        let peck = 0
        if (b.state === 'perched') {
          // Grounded idle: a bird pottering on its perch, not a frozen decal.
          // Heading drifts as it looks about — a slow swing with a smaller,
          // off-beat twitch laid over it, at incommensurate rates so it keeps
          // facing new ways instead of ticking to and fro. The body shuffles a
          // step forward and back along that facing with a low bob, and now and
          // then it dips its head to peck. Every term is a pure function of
          // `time` and this bird's own fixed phases (the same way the flap and
          // the altitude bob already are), so nothing accumulates frame to frame
          // and no two birds move in step.
          const gh =
            b.legHeading +
            (Math.sin(time * GROUND_TURN_SLOW + b.flapPhase) +
              0.5 * Math.sin(time * GROUND_TURN_FIDGET + b.bobPhase)) *
              GROUND_TURN
          const gait = Math.sin(time * GAIT_SPEED + b.bobPhase)
          // Step along the way the bird faces (heading turns local +x to
          // (cos, -sin) in world), so it shuffles where it looks, not sideways.
          coreX = b.perchX + Math.cos(gh) * STEP_ROCK * gait
          coreY = b.perchY + (0.5 - 0.5 * Math.cos(time * GAIT_SPEED + b.bobPhase)) * HOP_HEIGHT
          coreZ = b.perchZ - Math.sin(gh) * STEP_ROCK * gait
          // Peck: a slow gate opens now and then, and while it is open the head
          // dips a few quick times — a bout of feeding, not a metronome.
          const gate = Math.max(0, Math.sin(time * PECK_WINDOW + b.flapPhase))
          peck = gate * (0.5 - 0.5 * Math.cos(time * PECK_RATE + b.bobPhase))
          heading = gh
        } else if (b.state === 'takeoff') {
          const p = smoothstep(b.stateT / TAKEOFF_DUR)
          // Climbing out along the heading, not rising off it: a bird leaves a
          // branch forwards and buys its height with distance.
          coreX = b.fromX + Math.cos(b.legHeading) * CLIMB_OUT * p
          coreY = lerp(b.fromY, b.toY, p)
          coreZ = b.fromZ + Math.sin(b.legHeading) * CLIMB_OUT * p
          heading = b.legHeading
        } else if (b.state === 'cruise') {
          const p = Math.min(1, b.stateT / b.cruiseDur)
          // A lazy arc rather than a ruled line: the heading swings across the
          // leg by `bend`, so the path curves and the bird banks through it.
          const a = b.legHeading + b.legBend * (p - 0.5)
          const along = b.legLen * p
          // Integrating the swing exactly is not worth it — sampling the mean
          // heading over the distance covered is a curve either way.
          const mean = b.legHeading + b.legBend * (p / 2 - 0.5)
          coreX = b.fromX + Math.cos(mean) * along
          coreZ = b.fromZ + Math.sin(mean) * along
          const altLow = ALT_LOW + b.altOffset
          const alt = b.legClimb ? altLow + (ALT_CLIMB - altLow) * Math.sin(Math.PI * p) : altLow
          coreY = alt + Math.sin(time * b.bobSpeed + b.bobPhase) * ALT_BOB
          heading = a
        } else {
          // A glide slope, flown in along the final heading. Straight-lining to
          // the perch drops the bird onto it from wherever it happened to be —
          // which is what fell like a leaf. It flies AT the perch instead: the
          // approach turns onto the run-in early and the height comes off over
          // the last GLIDE_IN metres, so it arrives travelling, and level.
          const p = smoothstep(b.stateT / b.landDur)
          const ddx = b.toX - b.fromX
          const ddz = b.toZ - b.fromZ
          const runIn = Math.hypot(ddx, ddz) > 0.01 ? Math.atan2(ddz, ddx) : b.legHeading
          // The gate: a point GLIDE_IN short of the perch, at cruising height.
          const gateX = b.toX - Math.cos(runIn) * GLIDE_IN
          const gateZ = b.toZ - Math.sin(runIn) * GLIDE_IN
          const TURN = 0.55 // share of the approach spent getting onto the run-in
          if (p < TURN) {
            const q = p / TURN
            coreX = lerp(b.fromX, gateX, q)
            coreY = b.fromY
            coreZ = lerp(b.fromZ, gateZ, q)
          } else {
            const q = (p - TURN) / (1 - TURN)
            coreX = lerp(gateX, b.toX, q)
            coreY = lerp(b.fromY, b.toY, q * q) // shed height late: a flare, not a dive
            coreZ = lerp(gateZ, b.toZ, q)
          }
          heading = runIn
        }

        const bx = coreX + b.ox
        const bz = coreZ + b.oz
        const by = coreY
        const grounded = b.state === 'perched'
        qHeading.setFromAxisAngle(yAxis, heading)
        pos.set(bx, by, bz)

        // The body carries no flap — just heading. Grounded it stands plumper
        // than the flight spindle (a per-instance scale of the shared geometry,
        // not a second mesh); airborne it is left exactly as it was. Set it
        // first, then the wings hinge around it.
        m.compose(pos, qHeading, grounded ? GROUND_BODY_SCALE : one)
        body.setMatrixAt(i, m)

        // Wings: a live wingbeat in the air, folded in against the body on the
        // ground — spread wings on a perched bird read as a flat diamond. The
        // fold is a fixed, negative angle through the very same hinge, lifting
        // the tips up and in, with the span pulled in by scale so the wing
        // closes rather than sticks out. Flap first, in the wing's own local
        // frame, then orient the whole bird by heading — the opposite order
        // would swing the wingtip through the ground on a bird flying north.
        const flap = grounded ? -WING_FOLD : Math.sin(time * b.flapSpeed + b.flapPhase) * FLAP_AMPLITUDE
        const wingScale = grounded ? GROUND_WING_SCALE : one
        qFlap.setFromAxisAngle(xAxis, flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, wingScale)
        rightWing.setMatrixAt(i, m)

        // Mirrored sign, so both wings rise and fall (or fold) together — a real
        // wingbeat is symmetric; matching signs would look like scissors.
        qFlap.setFromAxisAngle(xAxis, -flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, wingScale)
        leftWing.setMatrixAt(i, m)

        // Head, neck and tail are a grounded bird's alone. In the air they fold
        // away to a point (zero scale), so the airborne silhouette — the thing
        // the player already likes — is untouched. Offsets are in the body's own
        // frame, applied through qHeading, so a turn carries them along with it.
        if (grounded) {
          // Head: raised and forward on the neck, dropping and reaching a little
          // on a peck.
          off.set(HEAD_FWD + peck * PECK_REACH, HEAD_UP - peck * PECK_DROP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          m.compose(partPos, qHeading, one)
          head.setMatrixAt(i, m)

          // Neck: a short stub at the shoulder-to-head midpoint, leaning forward.
          off.set(NECK_MID_FWD, NECK_MID_UP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          partQuat.copy(qHeading).multiply(qNeckTilt)
          m.compose(partPos, partQuat, one)
          neck.setMatrixAt(i, m)

          // Tail: rooted behind the body and cocked up a touch off flat.
          off.set(-TAIL_BACK, TAIL_UP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          partQuat.copy(qHeading).multiply(qTailTilt)
          m.compose(partPos, partQuat, one)
          tail.setMatrixAt(i, m)
        } else {
          m.compose(pos, qHeading, zeroScale)
          head.setMatrixAt(i, m)
          neck.setMatrixAt(i, m)
          tail.setMatrixAt(i, m)
        }
      }
      body.instanceMatrix.needsUpdate = true
      rightWing.instanceMatrix.needsUpdate = true
      leftWing.instanceMatrix.needsUpdate = true
      head.instanceMatrix.needsUpdate = true
      neck.instanceMatrix.needsUpdate = true
      tail.instanceMatrix.needsUpdate = true
    },
  }
}
