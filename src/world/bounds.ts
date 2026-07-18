/**
 * The world's drivable edge, as a shape the barrier and the mist wall both read.
 *
 * Kept behind an interface so the shape is swappable: today it's a circle, and a
 * real OSM admin-boundary polygon can drop in later (see TODO "real boundaries")
 * with no change to the consumers. `probe` answers the two geometric questions
 * the barrier needs — how far a point lies OUTSIDE the soft and hard edges, and
 * the outward normal there — while `confineToBounds` owns the braking policy, so
 * neither the shape nor the feel leaks into the other.
 */
export interface WorldBounds {
  /**
   * For a point (x,z): signed distances (metres) to the soft and hard edges —
   * positive when the point lies OUTSIDE that edge — and the outward unit normal.
   */
  probe(x: number, z: number): BoundsProbe
  /** Extent used to place the mist wall, metres from the origin at the hard edge. */
  readonly hard: number
}

export interface BoundsProbe {
  /** Metres past the soft edge (>0 outside, ≤0 inside). Braking starts here. */
  soft: number
  /** Metres past the hard edge (>0 outside). The backstop clamps this to 0. */
  hard: number
  /** Outward unit normal at (x,z) — away from the centre for a circle. */
  nx: number
  nz: number
}

/** A minimal moving body the barrier confines. `CarState` satisfies it structurally. */
export interface Movable {
  x: number
  z: number
  vx: number
  vz: number
}

/**
 * A circular boundary centred on the origin: soft braking begins at `soft`
 * metres out, the hard backstop sits at `hard`. Requires `soft < hard`.
 */
export function circleBounds(soft: number, hard: number): WorldBounds {
  return {
    hard,
    probe(x, z) {
      const r = Math.hypot(x, z)
      // At the exact centre the normal is undefined; any direction serves, since
      // both distances are deeply negative (inside) and the barrier ignores them.
      const nx = r > 1e-6 ? x / r : 1
      const nz = r > 1e-6 ? z / r : 0
      return { soft: r - soft, hard: r - hard, nx, nz }
    },
  }
}

/**
 * Confine a body to the bounds, mutating it in place.
 *
 * Past the soft edge the OUTWARD radial velocity is bled — exponentially, and
 * harder the deeper in — so the car mires as if it hit mud instead of a wall.
 * The TANGENTIAL component is untouched, so you can still graze along the edge.
 * Past the hard edge the position is clamped back and any remaining outward
 * velocity zeroed. Driving back inward is never braked. `brake` is the decay
 * rate (1/s).
 */
export function confineToBounds(m: Movable, bounds: WorldBounds, dt: number, brake = 3): void {
  const p = bounds.probe(m.x, m.z)
  if (p.soft <= 0) return // inside the soft edge: nothing to do
  const vr = m.vx * p.nx + m.vz * p.nz // outward radial speed
  if (vr > 0) {
    const band = p.soft - p.hard // soft..hard gap (= hard−soft radius for a circle)
    const depth = band > 0 ? Math.min(1, p.soft / band) : 1
    const keep = Math.exp(-brake * (0.4 + depth) * dt)
    const removed = vr * (1 - keep)
    m.vx -= removed * p.nx
    m.vz -= removed * p.nz
  }
  if (p.hard > 0) {
    m.x -= p.hard * p.nx
    m.z -= p.hard * p.nz
    const vr2 = m.vx * p.nx + m.vz * p.nz
    if (vr2 > 0) {
      m.vx -= vr2 * p.nx
      m.vz -= vr2 * p.nz
    }
  }
}
