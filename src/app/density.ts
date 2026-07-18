/** How busy the world is: how many cars, people, trains, boats and aircraft. */
export type Density = 'low' | 'normal' | 'high'

export const DENSITIES: readonly Density[] = ['low', 'normal', 'high']

/**
 * The multiplier for things there are a handful of: trains, trams, boats.
 *
 * These are bounded by the map — a city has the railways it has — so 'many'
 * quickly runs out of lines to put them on, and a few of them go a long way.
 */
const SCALE: Record<Density, number> = { low: 1, normal: 2, high: 4 }

/**
 * The multiplier for the crowd: cars and people.
 *
 * They spread over the whole road network and are only kept near the player, so
 * on a big map a couple of dozen vanish into it. They also cost far less each —
 * instanced, no physics — so 'many' can mean many.
 */
const CROWD_SCALE: Record<Density, number> = { low: 1, normal: 4, high: 8 }

/** `base` scaled to this setting, never below one. */
export function countFor(density: Density, base: number): number {
  return Math.max(1, Math.round(base * SCALE[density]))
}

/** As countFor, for cars and people. */
export function crowdFor(density: Density, base: number): number {
  return Math.max(1, Math.round(base * CROWD_SCALE[density]))
}

/** How long to wait between aircraft, scaled: busier means more often. */
export function gapFor(density: Density, base: number): number {
  return base / SCALE[density]
}
