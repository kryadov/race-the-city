/** How busy the world is: how many cars, people, trains, boats and aircraft. */
export type Density = 'low' | 'normal' | 'high'

export const DENSITIES: readonly Density[] = ['low', 'normal', 'high']

/**
 * The multiplier on every population.
 *
 * One knob for the lot, because they compete for the same frame: a city with
 * plenty of everything is the expensive case, not a city with plenty of cars.
 */
const SCALE: Record<Density, number> = { low: 0.4, normal: 1, high: 2 }

/** `base` scaled to this setting, never below one. */
export function countFor(density: Density, base: number): number {
  return Math.max(1, Math.round(base * SCALE[density]))
}

/** How long to wait between aircraft, scaled: busier means more often. */
export function gapFor(density: Density, base: number): number {
  return base / SCALE[density]
}
