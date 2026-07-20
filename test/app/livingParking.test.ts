import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createLivingParking,
  advanceCycle,
  cyclePosition,
  cycleOpacity,
  exitPoint,
  kerbPoint,
  walkerState,
  type Cycle,
} from '../../src/app/livingParking'
import { pointInPolygon } from '../../src/physics/collide'
import type { Vec2 } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

/** A deterministic PRNG so counts and layout are stable across runs. */
function testRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A roomy lot, long side along x, cornered near the origin. */
const lot: Vec2[] = [v(4, 4), v(64, 4), v(64, 44), v(4, 44)]
/** A square lot `size` metres on a side, cornered at (ox, oz). */
const square = (size: number, ox = 0, oz = 0): Vec2[] =>
  [v(ox, oz), v(ox + size, oz), v(ox + size, oz + size), v(ox, oz + size)]

const flat: ElevationProvider = { heightAt: () => 0 }

describe('exitPoint', () => {
  it('sits just inside the lot, near the corner facing the origin', () => {
    const e = exitPoint(lot)
    expect(pointInPolygon(e.x, e.z, lot)).toBe(true) // inside, not on the edge
    // The lot's nearest point to the origin is its (4,4) corner; the exit is a
    // couple of metres in from there, not off at the far end.
    expect(Math.hypot(e.x - 4, e.z - 4)).toBeLessThan(5)
  })

  it('is a fixed per-lot point (no randomness)', () => {
    expect(exitPoint(lot)).toEqual(exitPoint(lot))
  })

  it('lands inside even when the origin is inside the lot', () => {
    const around: Vec2[] = [v(-30, -20), v(30, -20), v(30, 20), v(-30, 20)]
    expect(pointInPolygon(exitPoint(around).x, exitPoint(around).z, around)).toBe(true)
  })
})

describe('advanceCycle', () => {
  const base: Cycle = { phase: 'parked', clock: 0, dwell: 10, travel: 5, gap: 4 }

  it('holds a phase until its duration elapses, then steps to the next', () => {
    expect(advanceCycle(base, 3).phase).toBe('parked')
    const left = advanceCycle(base, 12)
    expect(left.phase).toBe('leaving')
    expect(left.clock).toBeCloseTo(2, 6) // 2s of overrun carried into the leg
  })

  it('walks parked → leaving → empty → arriving → parked in order over time', () => {
    let c = base
    const seen: string[] = [c.phase]
    for (let i = 0; i < 500; i++) {
      const next = advanceCycle(c, 0.1)
      if (next.phase !== c.phase) seen.push(next.phase)
      c = next
    }
    // The order the phases first recur in, over the ~24s period, is the cycle.
    expect(seen.slice(0, 5)).toEqual(['parked', 'leaving', 'empty', 'arriving', 'parked'])
  })

  it('carries a big step across several phases to the right landing', () => {
    // Full period = dwell + travel + gap + travel = 24s → back to parked, clock 0.
    const round = advanceCycle(base, 24)
    expect(round.phase).toBe('parked')
    expect(round.clock).toBeCloseTo(0, 6)
  })

  it('a small step and its equivalent sum land in the same place', () => {
    let step = base
    for (let i = 0; i < 30; i++) step = advanceCycle(step, 0.5)
    const once = advanceCycle(base, 15)
    expect(step.phase).toBe(once.phase)
    expect(step.clock).toBeCloseTo(once.clock, 6)
  })
})

describe('cycleOpacity', () => {
  const c: Cycle = { phase: 'parked', clock: 0, dwell: 10, travel: 5, gap: 4 }
  it('is solid parked and gone empty', () => {
    expect(cycleOpacity({ ...c, phase: 'parked' })).toBe(1)
    expect(cycleOpacity({ ...c, phase: 'empty' })).toBe(0)
  })
  it('fades out over the end of leaving and in over the start of arriving', () => {
    expect(cycleOpacity({ ...c, phase: 'leaving', clock: 0 })).toBeCloseTo(1)
    expect(cycleOpacity({ ...c, phase: 'leaving', clock: 5 })).toBeCloseTo(0)
    expect(cycleOpacity({ ...c, phase: 'arriving', clock: 0 })).toBeCloseTo(0)
    expect(cycleOpacity({ ...c, phase: 'arriving', clock: 5 })).toBeCloseTo(1)
  })
})

describe('cyclePosition', () => {
  const bay = v(60, 40)
  const exit = exitPoint(lot)
  const c: Cycle = { phase: 'parked', clock: 0, dwell: 10, travel: 5, gap: 4 }

  it('parks at the bay and waits empty at the exit', () => {
    expect(cyclePosition({ ...c, phase: 'parked' }, bay, exit)).toEqual({ x: 60, z: 40 })
    expect(cyclePosition({ ...c, phase: 'empty' }, bay, exit)).toEqual({ x: exit.x, z: exit.z })
  })

  it('lerps bay → exit leaving and exit → bay arriving', () => {
    const mid = cyclePosition({ ...c, phase: 'leaving', clock: 2.5 }, bay, exit)
    expect(mid.x).toBeCloseTo((bay.x + exit.x) / 2)
    expect(mid.z).toBeCloseTo((bay.z + exit.z) / 2)
    const back = cyclePosition({ ...c, phase: 'arriving', clock: 5 }, bay, exit)
    expect(back.x).toBeCloseTo(bay.x)
    expect(back.z).toBeCloseTo(bay.z)
  })

  it('never leaves the lot polygon across a whole cycle', () => {
    const exitP = exitPoint(lot)
    let cyc: Cycle = { phase: 'parked', clock: 0, dwell: 9, travel: 6, gap: 5 }
    for (let i = 0; i < 400; i++) {
      cyc = advanceCycle(cyc, 0.1)
      const p = cyclePosition(cyc, bay, exitP)
      expect(pointInPolygon(p.x, p.z, lot), `${cyc.phase} ${p.x},${p.z}`).toBe(true)
    }
  })
})

describe('kerbPoint', () => {
  const bay = v(60, 40)
  const mid = { x: 34, z: 24 } // the lot's centroid

  it('sits inside the lot, a few metres in toward the interior', () => {
    const k = kerbPoint(bay, lot)
    expect(k).not.toBeNull()
    expect(pointInPolygon(k!.x, k!.z, lot)).toBe(true)
    // It walked inward: nearer the centroid than the bay is.
    expect(Math.hypot(k!.x - mid.x, k!.z - mid.z)).toBeLessThan(Math.hypot(bay.x - mid.x, bay.z - mid.z))
    // ...but not far — a stride of a few metres, not a march across the lot.
    expect(Math.hypot(k!.x - bay.x, k!.z - bay.z)).toBeLessThan(4)
  })

  it('is a fixed per-bay point (no randomness)', () => {
    expect(kerbPoint(bay, lot)).toEqual(kerbPoint(bay, lot))
  })
})

describe('walkerState', () => {
  // Windows: ALIGHT_T = 2.5s at the start of PARKED, BOARD_T = 2.5s at the end.
  const bay = v(60, 40)
  const kerb = kerbPoint(bay, lot)!
  const c: Cycle = { phase: 'parked', clock: 0, dwell: 12, travel: 5, gap: 4 }
  const near = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)

  it('is hidden outside the PARKED phase', () => {
    for (const phase of ['leaving', 'empty', 'arriving'] as const) {
      expect(walkerState({ ...c, phase, clock: 1 }, bay, kerb).visible).toBe(false)
    }
  })

  it('is hidden in the dead time between the two windows', () => {
    expect(walkerState({ ...c, clock: 6 }, bay, kerb).visible).toBe(false) // mid-dwell
  })

  it('alights bay → kerb, fading out as it arrives', () => {
    const start = walkerState({ ...c, clock: 0 }, bay, kerb)
    expect(start.visible).toBe(true)
    expect(near(start.pos, bay)).toBeCloseTo(0) // steps out at the car
    expect(start.opacity).toBeCloseTo(1)
    const end = walkerState({ ...c, clock: 2.49 }, bay, kerb)
    expect(end.visible).toBe(true)
    expect(near(end.pos, kerb)).toBeLessThan(0.05) // reached the kerb
    expect(end.opacity).toBeLessThan(0.2) // and has all but faded out
  })

  it('boards kerb → bay, fading in at the kerb', () => {
    const start = walkerState({ ...c, clock: c.dwell - 2.49 }, bay, kerb)
    expect(start.visible).toBe(true)
    expect(near(start.pos, kerb)).toBeLessThan(0.05) // appears at the kerb
    expect(start.opacity).toBeLessThan(0.2) // faint at first
    const end = walkerState({ ...c, clock: c.dwell - 0.01 }, bay, kerb)
    expect(end.visible).toBe(true)
    expect(near(end.pos, bay)).toBeLessThan(0.05) // back at the car (getting in)
    expect(end.opacity).toBeCloseTo(1)
  })

  it('never leaves the lot while it is on show', () => {
    let cyc: Cycle = { phase: 'parked', clock: 0, dwell: 12, travel: 6, gap: 5 }
    for (let i = 0; i < 400; i++) {
      cyc = advanceCycle(cyc, 0.1)
      const w = walkerState(cyc, bay, kerb)
      if (w.visible) expect(pointInPolygon(w.pos.x, w.pos.z, lot), `${w.pos.x},${w.pos.z}`).toBe(true)
    }
  })
})

describe('createLivingParking', () => {
  const scene = (): THREE.Scene => new THREE.Scene()
  /** Just the animated cars in the mover group (walkers share it, tagged apart). */
  const carsOf = (g: THREE.Group): THREE.Object3D[] =>
    g.children.filter((o) => o.userData.livingKind === 'car')

  it('brings a lot to life with a small, capped pool', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(1))
    const group = s.children[0] as THREE.Group
    expect(carsOf(group).length).toBeGreaterThan(0)
    expect(carsOf(group).length).toBeLessThanOrEqual(2) // per-lot cap
    lp.dispose()
  })

  it('gives its cars a walker figure to get in and out', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(20))
    const group = s.children[0] as THREE.Group
    let heads = 0
    group.traverse((o) => {
      if ((o as THREE.Mesh).geometry instanceof THREE.SphereGeometry) heads++ // a walker's head
    })
    expect(heads).toBeGreaterThan(0)
    lp.dispose()
  })

  it('caps the whole map at a dozen animated cars', () => {
    const s = scene()
    const lots = Array.from({ length: 20 }, (_, i) => square(120, i * 200, 0))
    const lp = createLivingParking(s, lots, flat, testRng(2))
    const group = s.children[0] as THREE.Group
    expect(carsOf(group).length).toBeGreaterThan(0)
    expect(carsOf(group).length).toBeLessThanOrEqual(12)
    lp.dispose()
  })

  it('flags itself for the neon theme', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(3))
    expect((s.children[0] as THREE.Group).userData.neonMover).toBe('bot')
    lp.dispose()
  })

  it('is deterministic for a given seed', () => {
    const a = scene()
    const b = scene()
    createLivingParking(a, [lot], flat, testRng(4))
    createLivingParking(b, [lot], flat, testRng(4))
    const ga = carsOf(a.children[0] as THREE.Group)
    const gb = carsOf(b.children[0] as THREE.Group)
    expect(ga.length).toBe(gb.length)
    expect(ga[0].position.x).toBeCloseTo(gb[0].position.x)
    expect(ga[0].position.z).toBeCloseTo(gb[0].position.z)
  })

  it('keeps every car AND its walker inside the lot for the whole run', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(5))
    const group = s.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0)
    for (let i = 0; i < 800; i++) {
      lp.update(0.1) // ~80s: several full cycles per car
      // Every child — car or walker — must stay on the tarmac, always.
      for (const o of group.children) {
        expect(pointInPolygon(o.position.x, o.position.z, lot), `${o.userData.livingKind} ${o.position.x},${o.position.z}`).toBe(true)
      }
    }
    lp.dispose()
  })

  it('removes its group and frees geometry on dispose', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(6))
    expect(s.children.length).toBe(1)
    lp.dispose()
    expect(s.children.length).toBe(0)
  })

  it('does nothing without a lot', () => {
    const s = scene()
    const lp = createLivingParking(s, [], flat, testRng(7))
    expect((s.children[0] as THREE.Group).children.length).toBe(0)
    lp.update(1)
    lp.dispose()
  })

  it('can be switched off', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(8))
    const group = s.children[0] as THREE.Group
    lp.setEnabled(false)
    expect(group.visible).toBe(false)
    lp.setEnabled(true)
    expect(group.visible).toBe(true)
    lp.dispose()
  })
})
