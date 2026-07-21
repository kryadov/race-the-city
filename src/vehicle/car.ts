import type { SpatialGrid } from '../physics/grid'
import { resolveCircle } from '../physics/collide'
import type { ElevationProvider } from '../terrain/provider'
import { HOVERS, HOVER_H, type VehicleSpec } from './vehicles'

/** Car state. Velocity is a world-space vector (vx, vz) so the car can drift. */
export interface CarState {
  x: number
  z: number
  y: number
  heading: number
  vx: number
  vz: number
  /**
   * Vertical speed. While airborne this is real, falling under gravity; while on
   * the ground it carries the rate the terrain is climbing at, which is what
   * decides whether cresting a rise launches the car.
   */
  vy: number
  /**
   * Barrel over a big jump. `tumble` is the forward-flip angle (radians, 0 =
   * level); `tumbleRate` its spin while airborne. A gentle hop never touches
   * these — only a launch harder than {@link ROLL_LAUNCH_VY} sets a rate, the car
   * flips through the air, and once back on the ground it rights itself to the
   * nearest whole turn so it always lands on its wheels. Optional so the many
   * existing `CarState` literals need no change; treated as 0 when absent.
   */
  tumble?: number
  tumbleRate?: number
}
export interface CarInput {
  throttle: number
  steer: number
  brake: boolean
}

export function createCar(x = 0, z = 0): CarState {
  return { x, z, y: 0, heading: 0, vx: 0, vz: 0, vy: 0, tumble: 0, tumbleRate: 0 }
}

/** Arcade gravity — heavier than life, so jumps land before you get bored. */
export const GRAVITY = 18
/** Below this climb rate nothing throws the car, however sharp the crest. */
export const TAKEOFF_VY = 2.5
/**
 * A launch gentler than this just hops; only a harder one tips the car into a
 * flip. Well above TAKEOFF_VY, so cresting a kerb or a bridge arch leaves you
 * upright and only a proper ramp kick sends you over.
 */
export const ROLL_LAUNCH_VY = 9
/** Flip spin per m/s of launch, and its ceiling — one big jump is a turn or two. */
const ROLL_GAIN = 0.55
const MAX_TUMBLE_RATE = 9
/** How fast the car rights itself to the nearest whole turn once back down. */
const TUMBLE_SETTLE_K = 7
const TAU = Math.PI * 2
/** Ceiling on the climb rate a slope can impart, m/s. */
const MAX_CLIMB = 22
/**
 * The steepest thing the car will treat as a slope, as a gradient — about 31°.
 *
 * Anything steeper is a step, not a ramp, and a step throws nothing: you cannot
 * launch off a kerb by driving into it. Bridges are where this bites. The deck
 * is snapped to, so the ground under the car gains a couple of metres between
 * one frame and the next at the join; taken as a slope that is a climb of
 * 100m/s, and the frame after it the ground stops climbing and fires the car
 * twenty metres up. Measuring the rise against the distance actually travelled
 * is what tells the two apart.
 */
const MAX_SLOPE = 0.6
/**
 * A downward step this deep or more is a ledge you fly off, not a kerb you drop
 * down. Off a roof edge or the end of a high bridge the surface falls metres in
 * one frame; snapping the car down to the street there read as it dropping
 * THROUGH the surface. Set above the drop of any real kerb or terrain step, so
 * only a genuine cliff launches the car.
 */
const LEDGE_DROP = 1
/** Above the ground by more than this and the car is flying. */
const AIR_EPS = 0.05
/**
 * How much speed a graze along a wall keeps. Hitting a building used to bleed
 * ALL velocity to 30%, so pinned against a wall the car crawled and steering
 * away was a fight. Now only the component driving INTO the wall is removed and
 * the tangential is kept, bar this small cost — so you slide along it and peel
 * off smoothly.
 */
const WALL_SLIDE = 0.9

/**
 * Arcade drift step. heading 0 faces +x; +heading rotates toward +z.
 * Steering rotates the heading; the velocity is then split into forward and
 * lateral components relative to the new heading. Forward gets engine/drag,
 * lateral gets tire grip — low grip lets the tail slide out (drift).
 */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  grid: SpatialGrid,
  provider: ElevationProvider,
  spec: VehicleSpec,
): CarState {
  // Forward speed relative to the current heading (for steering authority + sign).
  const fx0 = Math.cos(car.heading)
  const fz0 = Math.sin(car.heading)
  const vForward0 = car.vx * fx0 + car.vz * fz0

  // Steering: scaled by speed (can't spin when parked), reversed when backing up.
  const speedFactor = Math.min(1, Math.abs(vForward0) / spec.turnSpeedRef)
  const dir = vForward0 < 0 ? -1 : 1
  const heading = car.heading + input.steer * spec.turnRate * speedFactor * dir * dt

  // New heading basis: forward (fx,fz) and right/lateral (rx,rz).
  const fx = Math.cos(heading)
  const fz = Math.sin(heading)
  const rx = -fz
  const rz = fx

  let vF = car.vx * fx + car.vz * fz
  let vL = car.vx * rx + car.vz * rz

  // Engine + braking on the forward axis.
  vF += input.throttle * spec.accel * dt
  if (input.brake) {
    const b = spec.brakeAccel * dt
    vF = vF > 0 ? Math.max(0, vF - b) : Math.min(0, vF + b) // brake toward 0, never past it
  }
  vF *= Math.exp(-spec.dragForward * dt)
  if (Math.abs(vF) < 0.001) vF = 0
  vF = Math.max(-spec.maxReverse, Math.min(spec.maxSpeed, vF))

  // Tire grip on the lateral axis: slide decays; low grip = drift.
  vL *= Math.exp(-spec.gripLateral * dt)

  // Recompose world velocity and integrate position.
  let vx = vF * fx + vL * rx
  let vz = vF * fz + vL * rz
  const nx = car.x + vx * dt
  const nz = car.z + vz * dt

  // Its own height goes in: land on a wall and you are stopped by it, but clear
  // the roof and you are over it. A jump that a wall could cancel in mid-air was
  // not a jump.
  const resolved = resolveCircle(nx, nz, spec.radius, grid, car.y)
  if (resolved.x !== nx || resolved.z !== nz) {
    // Slide along the wall rather than stop dead against it. The push-out vector
    // is the wall normal; remove only the velocity driving INTO it and keep the
    // tangential (bar a small cost), so grazing a building and steering away are
    // smooth instead of a crawl.
    const px = resolved.x - nx
    const pz = resolved.z - nz
    const pl = Math.hypot(px, pz)
    if (pl > 1e-6) {
      const wnx = px / pl
      const wnz = pz / pl
      const into = vx * wnx + vz * wnz // component along the outward normal
      if (into < 0) {
        vx -= into * wnx // cancel the into-wall part, leaving the slide
        vz -= into * wnz
        vx *= WALL_SLIDE
        vz *= WALL_SLIDE
      }
    }
  }

  const groundY = provider.heightAt(resolved.x, resolved.z)

  // A hovercraft holds its height: it floats, so nothing throws it — and nothing
  // flips it either.
  if (HOVERS[spec.key]) {
    return { x: resolved.x, z: resolved.z, y: groundY + HOVER_H, heading, vx, vz, vy: 0, tumble: 0, tumbleRate: 0 }
  }

  let y: number
  let vy: number
  // Are we flying? Ask the ground under where we ARE, not under where we're
  // going. On a descent the ground ahead is legitimately lower — by more than
  // AIR_EPS at speed — and testing against that calls a car driving downhill
  // airborne. It then falls from rest, slower than the road drops, and detaches:
  // that was the shudder coming off a bridge arch.
  const groundHere = provider.heightAt(car.x, car.z)
  if (car.y > groundHere + AIR_EPS) {
    // Airborne: fall, and land when the ground catches up.
    vy = car.vy - GRAVITY * dt
    y = car.y + vy * dt
    if (y <= groundY) {
      y = groundY
      vy = 0
    }
  } else {
    // On the ground. The terrain asks for this much climb per second — but only
    // as fast as a slope could deliver it at the speed we are going. The car is
    // still put on the ground either way; this is the climb the NEXT frame reads
    // to decide whether we crested something, and a step in the surface must not
    // read as a launch.
    const rise = groundY - car.y
    const reach = Math.hypot(vx, vz) * dt * MAX_SLOPE
    // Past what the distance travelled could have climbed, this is a step, not a
    // slope: you cannot ramp off a kerb, and a step throws nothing on its own.
    const isStep = Math.abs(rise) > reach
    if (isStep && rise < -LEDGE_DROP) {
      // The surface fell away below us as a sheer drop — a roof edge, the end of
      // a high bridge. Fly off it: carry the horizontal speed into an arc and let
      // gravity take over, instead of snapping straight down to the street. That
      // snap was the "falls through it" — the car reached the lip and dropped
      // rather than launching. Any climb it already had is carried into the arc,
      // so coming off a rise you leap; coming off flat you tip over the edge.
      vy = car.vy - GRAVITY * dt
      y = car.y + vy * dt
      if (y <= groundY) {
        // The drop turned out shallow after all (ground close below): just settle.
        y = groundY
        vy = 0
      }
    } else {
      // A slope imparts the climb it asks, capped to what the distance travelled
      // could deliver; a step up is snapped onto and imparts nothing.
      const climb = isStep ? 0 : Math.max(-MAX_CLIMB, Math.min(MAX_CLIMB, rise / dt))
      // You leave the ground on a rise only when it falls away faster than gravity
      // can hold you to it — not merely because you were going up and now aren't.
      // Testing the latter launched the car off the crest of every bridge arch.
      const surfaceAccel = (climb - car.vy) / dt
      if (car.vy > TAKEOFF_VY && surfaceAccel < -GRAVITY) {
        vy = car.vy
        y = car.y + vy * dt
        if (y < groundY) {
          y = groundY
          vy = climb
        }
      } else {
        y = groundY
        vy = climb // remembered, so the next frame knows if we crested a rise
      }
    }
  }

  // Tumble over a big launch. We know now whether the car has left the ground
  // (nowAirborne) and whether it just did (was on the ground last frame). A hard
  // enough upward launch tips it into a forward flip that keeps turning through
  // the flight; back on the ground it stops spinning and eases to the nearest
  // whole turn, so however it flipped it settles on its wheels.
  let tumble = car.tumble ?? 0
  let tumbleRate = car.tumbleRate ?? 0
  const wasAirborne = car.y > groundHere + AIR_EPS
  const nowAirborne = y > groundY + AIR_EPS
  if (!wasAirborne && nowAirborne && vy > ROLL_LAUNCH_VY && tumbleRate === 0 && tumble === 0) {
    tumbleRate = Math.min(MAX_TUMBLE_RATE, vy * ROLL_GAIN)
  }
  if (nowAirborne && tumbleRate !== 0) {
    tumble += tumbleRate * dt // mid-flip, still in the air
  } else if (!nowAirborne) {
    tumbleRate = 0
    if (tumble !== 0) {
      const target = Math.round(tumble / TAU) * TAU // the nearest upright orientation
      tumble += (target - tumble) * (1 - Math.exp(-TUMBLE_SETTLE_K * dt))
      if (Math.abs(tumble - target) < 1e-3) tumble = 0
    }
  }

  return { x: resolved.x, z: resolved.z, y, heading, vx, vz, vy, tumble, tumbleRate }
}
