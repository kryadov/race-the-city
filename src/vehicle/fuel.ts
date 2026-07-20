/**
 * A tank, and what an empty one does to a car.
 *
 * Deliberately not a fail state: running dry does not strand you, it makes the
 * car a dog until you find a can. Being unable to move in a driving game is not
 * a challenge, it is the end of the session.
 */

/** Seconds of full throttle a full tank is worth. */
export const TANK = 240
/** What one can gives back, as a share of the tank. */
export const CAN_WORTH = 0.35
/**
 * Below this share of a tank the car starts losing its legs, and the gauge
 * should be shouting about it.
 */
export const LOW = 0.2
/** The most a dry tank takes off the top speed: a limp, not a stop. */
export const DRY_PENALTY = 0.55

/**
 * How much of the tank a frame at this throttle burns.
 *
 * @param thirst per-vehicle burn multiplier (a plain car = 1; a lorry drinks more,
 *   an EV less — see `thirstOf`). Defaults to 1 so callers that don't care are unaffected.
 */
export function burn(fuel: number, throttle: number, dt: number, thirst = 1): number {
  // Idling costs nothing to speak of; what empties a tank is the right foot.
  const used = (Math.abs(throttle) * dt * thirst) / TANK
  return Math.max(0, fuel - used)
}

/**
 * What the tank does to the car's top speed, as a multiplier.
 *
 * Full to LOW: nothing at all — a gauge that punishes you for being at half a
 * tank would have you hunting cans instead of driving. Below LOW it falls away
 * smoothly, so the car goes soft before it goes slow and you get told by the
 * driving rather than by the needle.
 */
export function speedFactor(fuel: number): number {
  if (fuel >= LOW) return 1
  const left = Math.max(0, fuel) / LOW
  return 1 - DRY_PENALTY * (1 - left)
}
