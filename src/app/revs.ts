import type { VehicleSpec } from '../vehicle/vehicles'

// A smooth, per-vehicle rev model for the tachometer.
//
// The dial has no real crankshaft to read, so we synthesise one. The old code
// did this as a gear STAIRCASE — revLoad*5, take the fractional part, feed that
// straight to the needle — which snaps back to the bottom of a gear the instant
// speed crosses a ratio, so the needle ticks like a clock. Here the target is a
// continuous function of load and throttle, and the reported rpm chases it
// through a first-order lag, so the needle always glides. It is also scaled off
// the vehicle spec: a truck sits low and lazy, a sports car spins high and eager.

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const TWO_PI = Math.PI * 2

// The roster's acceleration spread, used to place a vehicle on the "revviness"
// scale. accel is the best single proxy: a punchy engine both spins up and
// redlines higher, a sluggish one does neither. (roller ≈ 20, racecar ≈ 145.)
const ACCEL_MIN = 20
const ACCEL_MAX = 145

// Idle and redline, scaled by that eagerness. The redline top matches the dial's
// MAX_RPM (8000) so the sharpest engine can just reach full scale; the truck end
// tops out well short, because a truck never actually reaches its redline.
const IDLE_LOW = 650
const IDLE_HIGH = 950
const REDLINE_LOW = 4800
const REDLINE_HIGH = 8000

// The lag time-constant (seconds) — how quickly revs chase the target. A sports
// car answers the throttle almost at once; a truck's revs build lazily.
const TAU_LAZY = 0.42
const TAU_QUICK = 0.14

// How hard the throttle lifts revs above the pure-rolling line. Most effect when
// there is headroom (a blip at a standstill flares the engine); at full load the
// engine is already near the top and the pedal can add little.
const THROTTLE_LIFT = 0.55

// A gentle gear "wave" over the load: revs build through a ratio then ease off at
// the change. It is a sine, not a saw, so it stays CONTINUOUS — the needle rolls
// through the shift instead of dropping off a cliff the way the staircase did.
const GEARS = 5
const GEAR_RIPPLE = 0.05

export interface Revs {
  /**
   * Advance the model one frame. `speedKmh` is the vehicle's own road speed and
   * `throttle` is the -1..1 pedal; `vehicle` is the current spec (pass the base
   * spec, so load is measured against the vehicle's OWN top speed and a nitro run
   * that overshoots it simply pins the tach at the redline).
   */
  update(dt: number, speedKmh: number, throttle: number, vehicle: VehicleSpec): void
  /** Current engine speed in rpm, for hud.setRpm. */
  rpm(): number
}

/**
 * A stateful, deterministic rev model. Pure given its inputs: the same sequence
 * of update() calls always yields the same rpm(), so a reload reproduces it.
 */
export function createRevs(): Revs {
  let rpm = 0
  let started = false

  return {
    update(dt, speedKmh, throttle, vehicle) {
      // Place this vehicle on the revviness scale, then read its idle, redline
      // and response off it. Recomputed each frame because the player can swap
      // vehicles mid-drive (the arcade "find a car" pickups), and it is only a
      // handful of O(1) arithmetic ops.
      const eager = clamp01((vehicle.accel - ACCEL_MIN) / (ACCEL_MAX - ACCEL_MIN))
      const idle = lerp(IDLE_LOW, IDLE_HIGH, eager)
      const redline = lerp(REDLINE_LOW, REDLINE_HIGH, eager)
      const tau = lerp(TAU_LAZY, TAU_QUICK, eager)

      // Engine load: road speed against this vehicle's own top speed. Past the
      // top (a nitro overshoot) it clamps, so the needle just sits at redline.
      const topKmh = vehicle.maxSpeed * 3.6
      const load = clamp01(topKmh > 0 ? speedKmh / topKmh : 0)
      const lift = Math.max(0, throttle) * (1 - load) * THROTTLE_LIFT
      const wave = GEAR_RIPPLE * Math.sin(load * GEARS * TWO_PI)
      const demand = clamp01(load + lift + wave)
      const target = idle + (redline - idle) * demand

      if (!started) {
        // The engine boots already running: snap to the first target rather than
        // sweeping up from a dead zero on the first frame.
        started = true
        rpm = target
        return
      }
      // First-order lag toward the target. Framerate-independent via exp, and the
      // step is always a fraction of the remaining gap — so however far the target
      // moves in a frame, the needle can only ever glide a bounded amount of it.
      rpm += (target - rpm) * (1 - Math.exp(-Math.max(0, dt) / tau))
    },
    rpm() {
      return rpm
    },
  }
}
