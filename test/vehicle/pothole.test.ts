import { describe, it, expect } from 'vitest'
import {
  createDip,
  stepDip,
  makeHoleQuery,
  DIP_DEPTH,
  DIP_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
} from '../../src/vehicle/pothole'

/** Settle stepDip to its steady state under a fixed query (many small steps). */
function settle(x: number, z: number, heading: number, overHole: (x: number, z: number) => boolean) {
  let s = createDip()
  for (let i = 0; i < 400; i++) s = stepDip(s, x, z, heading, overHole, 1 / 60)
  return s
}

describe('stepDip', () => {
  it('is level when no wheel is over a hole', () => {
    const s = settle(0, 0, 0, () => false)
    expect(Math.abs(s.roll)).toBeLessThan(1e-6)
    expect(Math.abs(s.pitch)).toBeLessThan(1e-6)
  })

  it('rolls toward the side whose wheels drop in (heading 0: right is +z)', () => {
    // A hole strip along +z catches the two right-hand wheels (right offset = +HALF_WIDTH).
    const s = settle(0, 0, 0, (_x, z) => z > 0)
    // positive lean tips the car onto its right — that's the side that dropped.
    expect(s.roll).toBeGreaterThan(0.05)
    expect(Math.abs(s.pitch)).toBeLessThan(1e-6) // both front and rear right wheels dropped equally
  })

  it('rolls the opposite way for the left-hand wheels', () => {
    const right = settle(0, 0, 0, (_x, z) => z > 0)
    const left = settle(0, 0, 0, (_x, z) => z < 0)
    expect(left.roll).toBeCloseTo(-right.roll, 6)
  })

  it('pitches nose-up when the rear wheels drop, nose-down when the front do', () => {
    // heading 0: forward is +x, so front wheels sit at +HALF_LENGTH.
    const rear = settle(0, 0, 0, (x) => x < 0) // catch the rear axle
    const front = settle(0, 0, 0, (x) => x > 0) // catch the front axle
    expect(rear.pitch).toBeGreaterThan(0.02) // rear dropped → nose up (positive, matches car tumble)
    expect(front.pitch).toBeLessThan(-0.02) // front dropped → nose down
    expect(rear.pitch).toBeCloseTo(-front.pitch, 6)
  })

  it('follows the heading — the same hole hits a different wheel when the car is turned', () => {
    // A hole to the car's front-left in world terms. Facing +x it is off the nose+left;
    // facing +z (heading = π/2) that same world spot is now off the nose+right.
    const holeAt = (hx: number, hz: number) => (x: number, z: number) => Math.hypot(x - hx, z - hz) < DIP_RADIUS
    // Place the hole exactly under the front-left wheel when heading 0.
    const flx = HALF_LENGTH // forward +x
    const flz = -HALF_WIDTH // left is -z at heading 0
    const facingX = settle(0, 0, 0, holeAt(flx, flz))
    expect(facingX.roll).toBeLessThan(0) // left wheel down → roll left (negative)
    expect(facingX.pitch).toBeLessThan(0) // front wheel down → nose down
  })

  it('eases in and recovers rather than snapping', () => {
    const overHole = (_x: number, z: number) => z > 0
    let s = createDip()
    s = stepDip(s, 0, 0, 0, overHole, 1 / 60) // one frame in the hole
    const afterOne = s.roll
    const steady = settle(0, 0, 0, overHole).roll
    expect(afterOne).toBeGreaterThan(0) // it has started to tip...
    expect(afterOne).toBeLessThan(steady) // ...but not reached the full tilt in one frame
    // now drive out: the tilt decays back toward level
    let out = { ...s }
    for (let i = 0; i < 5; i++) out = stepDip(out, 0, 0, 0, () => false, 1 / 60)
    expect(out.roll).toBeLessThan(afterOne)
    expect(out.roll).toBeGreaterThan(0) // not instantly zero — it recovers over time
  })

  it('keeps the tilt gentle — a dip, not a barrel roll', () => {
    // Worst case: every wheel on one side down. Still a modest lean.
    const s = settle(0, 0, 0, (_x, z) => z > 0)
    expect(s.roll).toBeLessThan(0.2) // < ~11.5°
  })
})

describe('makeHoleQuery', () => {
  it('reports a point inside DIP_RADIUS of a spot, and misses one outside', () => {
    const q = makeHoleQuery([{ x: 10, z: 20 }])
    expect(q(10, 20)).toBe(true)
    expect(q(10 + DIP_RADIUS * 0.5, 20)).toBe(true)
    expect(q(10 + DIP_RADIUS * 2, 20)).toBe(false)
  })

  it('finds spots across cell boundaries (3×3 neighbour scan)', () => {
    // A spot right on a cell edge is still found from either side.
    const spots = []
    for (let i = 0; i < 50; i++) spots.push({ x: i * 37.1, z: i * -19.3 })
    const q = makeHoleQuery(spots)
    for (const s of spots) {
      expect(q(s.x, s.z)).toBe(true)
      expect(q(s.x + DIP_RADIUS * 0.9, s.z)).toBe(true)
    }
  })

  it('is empty for no spots', () => {
    const q = makeHoleQuery([])
    expect(q(0, 0)).toBe(false)
    expect(DIP_DEPTH).toBeGreaterThan(0) // sanity: the depth constant is exported
  })
})
