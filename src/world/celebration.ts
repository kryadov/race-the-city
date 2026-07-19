/**
 * The city throws a party on the calendar's big days. Given a date, this says
 * whether today is a celebration — and on the loudest of them (New Year, and a
 * couple of other famously firework-lit nights) it asks the sky to be lit up.
 *
 * Like season.ts, it is deliberately pure and THREE-free: the date is a
 * parameter (the app passes `new Date()` once, at load), and the pacing of the
 * bursts takes its randomness by injection, never `Math.random` at module
 * scope. Two reasons, both season.ts's: the Workflow sandbox has no `Date`, and
 * a seeded `rand` lets the unit tests pin the whole schedule without a clock.
 */

export interface Celebration {
  /** A short label for the day — 'New Year', 'Independence Day'. */
  name: string
  /**
   * true → auto-launch fireworks over the skyline for the whole session. The
   * quieter holidays (Halloween) carry a name but no rockets, so the flag is
   * what the render loop reads to decide whether to run a firework timer.
   */
  firework: boolean
}

/**
 * The calendar. Month is 0-based, to match `Date.getMonth()`. Kept to a handful
 * of well-known, date-*fixed* holidays on purpose: no lunar or Easter maths, so
 * the mapping is a table lookup that reads the same in every timezone that isn't
 * mid-flip at midnight. New Year straddles two days (its eve and its morning);
 * the July 4th and Bonfire Night nods are the other nights a real city fills
 * with fireworks; Halloween is here to dress the streets, not the sky.
 */
interface Holiday {
  month: number
  day: number
  name: string
  firework: boolean
}
const HOLIDAYS: Holiday[] = [
  { month: 0, day: 1, name: 'New Year', firework: true }, // Jan 1
  { month: 6, day: 4, name: 'Independence Day', firework: true }, // Jul 4
  { month: 9, day: 31, name: 'Halloween', firework: false }, // Oct 31 — costumes, no rockets
  { month: 10, day: 5, name: 'Bonfire Night', firework: true }, // Nov 5
  { month: 11, day: 31, name: "New Year's Eve", firework: true }, // Dec 31
]

/**
 * Is `date` a celebration? Returns the day's party, or null on an ordinary day.
 * A pure table lookup on month/day — the year and the time never matter.
 */
export function celebration(date: Date): Celebration | null {
  const month = date.getMonth()
  const day = date.getDate()
  for (const h of HOLIDAYS) {
    if (h.month === month && h.day === day) return { name: h.name, firework: h.firework }
  }
  return null
}

/** Where a party burst goes off, in metres relative to the car/camera. */
export interface FireworkBurst {
  x: number
  y: number
  z: number
}

/**
 * A running firework timer, deterministic for a given `rand`. The render loop
 * feeds it the frame time; it hands back a burst on the frames one should go
 * off, and null the rest — so bursts are sprinkled over the skyline at a
 * pleasant cadence rather than all at once on the first frame.
 */
export interface FireworkTimer {
  /** Advance by `dt` seconds. Returns a burst to fire this frame, else null. */
  tick(dt: number): FireworkBurst | null
}

// The cadence and the reach. A burst every ~0.6-1.8s reads as a display rather
// than a barrage; the ring (never right over the car) puts them out among the
// rooftops, at a height that clears them.
const GAP_MIN = 0.6 // seconds between bursts
const GAP_MAX = 1.8
const REACH_MIN = 40 // metres from the car the ring of bursts sits at
const REACH_MAX = 110
const HEIGHT_MIN = 35 // metres up — above the skyline
const HEIGHT_MAX = 70

/** Seconds until the next burst — one draw from `rand` over [GAP_MIN, GAP_MAX). */
function gap(rand: () => number): number {
  return GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
}

/** A burst on a ring around the car, thrown up over the roofs. Three draws. */
function burstAt(rand: () => number): FireworkBurst {
  const ang = rand() * Math.PI * 2
  const reach = REACH_MIN + rand() * (REACH_MAX - REACH_MIN)
  return {
    x: Math.cos(ang) * reach,
    y: HEIGHT_MIN + rand() * (HEIGHT_MAX - HEIGHT_MIN),
    z: Math.sin(ang) * reach,
  }
}

/**
 * Build a firework timer that paces bursts with the given `rand`. Injecting the
 * RNG (rather than reaching for `Math.random`) is what makes the schedule
 * testable: the same seed replays the same display, burst for burst.
 */
export function makeFireworkTimer(rand: () => number): FireworkTimer {
  let wait = gap(rand)
  return {
    tick(dt) {
      wait -= dt
      if (wait > 0) return null
      // += not =, so a long frame keeps the overshoot and the cadence doesn't
      // drift; at normal frame times this simply arms the next gap.
      wait += gap(rand)
      return burstAt(rand)
    },
  }
}
