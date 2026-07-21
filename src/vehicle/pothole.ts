/**
 * A wheel dropping into an open manhole, and the brief tilt it throws.
 *
 * The manhole layer (world/manholes.ts) sets ~1 in 8 covers *ajar* and surfaces
 * their world positions. When a wheel passes over one of those open lids the
 * corner drops in, and the body tips toward it — a suspension pothole, not just
 * a decal you drive through. The tilt eases in and recovers over a fraction of a
 * second, so rolling across one gives a quick jolt-and-settle rather than a lurch
 * you have to steer out of.
 *
 * This is pure geometry + a spring, tested without a renderer. The car has no
 * per-wheel suspension model, so the four wheels are notional corners at fixed
 * offsets from the hull centre; the tilt is fed into the same `lean` (roll) and
 * `tumble` (pitch) the renderer already applies (see app/scene.ts), so the render
 * wiring is a single add at the call site — no new mesh, no per-wheel rig.
 */

/** Roll (about the forward axis, +tips onto the right) and pitch (+nose up). */
export interface DipState {
  roll: number
  pitch: number
}

/** How far a wheel notionally drops into an open cover, metres. */
export const DIP_DEPTH = 0.28
/**
 * How near a wheel must pass an open cover to drop in. A shade wider than the
 * cover's own radius (COVER_R 0.6 in manholes.ts) so a wheel clips it rather than
 * having to hit dead centre — you feel the ones you graze, as on a real road.
 */
export const DIP_RADIUS = 0.75
/**
 * The car's four notional wheels, as offsets from the hull centre: forward (+x
 * local) and right (+ toward the model's right). No suspension rig exists, so
 * these are just where the corners sit for working out which way it tips. A ~3.2m
 * wheelbase and ~1.7m track — a mid-size car.
 */
export const HALF_LENGTH = 1.6
export const HALF_WIDTH = 0.85
/**
 * Spring rate back toward the resting tilt, per second. High enough that crossing
 * a lid is a quick jab-and-recover, not a wallow — full tilt is reached in ~0.2s
 * and shed about as fast once the wheel is clear.
 */
export const DIP_RECOVER_K = 14

export function createDip(): DipState {
  return { roll: 0, pitch: 0 }
}

/**
 * Advance the suspension dip one frame.
 *
 * @param state    previous dip (roll/pitch), eased toward the new target
 * @param x,z      the car's hull centre in world metres
 * @param heading  the car's heading (0 faces +x; +heading rotates toward +z)
 * @param overHole predicate: is this world point over an open cover? (see {@link makeHoleQuery})
 * @param dt       frame time, seconds
 */
export function stepDip(
  state: DipState,
  x: number,
  z: number,
  heading: number,
  overHole: (wx: number, wz: number) => boolean,
  dt: number,
): DipState {
  const fx = Math.cos(heading)
  const fz = Math.sin(heading)
  // Right axis, matching scene.ts (cross of forward and world-up): (-sin, cos).
  const rx = -fz
  const rz = fx

  let front = 0
  let rear = 0
  let left = 0
  let right = 0
  for (const fOff of [HALF_LENGTH, -HALF_LENGTH]) {
    for (const rOff of [HALF_WIDTH, -HALF_WIDTH]) {
      const wx = x + fx * fOff + rx * rOff
      const wz = z + fz * fOff + rz * rOff
      const drop = overHole(wx, wz) ? DIP_DEPTH : 0
      if (fOff > 0) front += drop
      else rear += drop
      if (rOff > 0) right += drop
      else left += drop
    }
  }

  // Tilt targets: the mean drop difference across the axle, as an angle over the
  // track/wheelbase. Right side down → roll onto the right (+, matches scene lean);
  // rear down → nose up (+, matches scene tumble).
  const rollTarget = Math.atan2((right - left) / 2, 2 * HALF_WIDTH)
  const pitchTarget = Math.atan2((rear - front) / 2, 2 * HALF_LENGTH)

  const t = 1 - Math.exp(-DIP_RECOVER_K * dt)
  return {
    roll: state.roll + (rollTarget - state.roll) * t,
    pitch: state.pitch + (pitchTarget - state.pitch) * t,
  }
}

/**
 * Build a fast "is this point over an open cover?" test from the open-cover
 * positions (manholes.ts surfaces these on the mesh's `userData.openManholes`).
 *
 * A spatial hash keyed on `2·radius` cells keeps each query to a 3×3-cell scan
 * rather than walking every open lid in the city, so it is cheap to call four
 * times a frame (once per wheel).
 */
export function makeHoleQuery(
  spots: { x: number; z: number }[],
  radius = DIP_RADIUS,
): (x: number, z: number) => boolean {
  const cell = radius * 2
  const r2 = radius * radius
  const grid = new Map<string, { x: number; z: number }[]>()
  for (const s of spots) {
    const key = `${Math.floor(s.x / cell)},${Math.floor(s.z / cell)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(s)
    else grid.set(key, [s])
  }
  return (x, z) => {
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const bucket = grid.get(`${gx},${gz}`)
        if (!bucket) continue
        for (const s of bucket) {
          const dx = s.x - x
          const dz = s.z - z
          if (dx * dx + dz * dz < r2) return true
        }
      }
    }
    return false
  }
}
