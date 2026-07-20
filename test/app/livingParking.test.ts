import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createLivingParking,
  advanceCycle,
  cyclePosition,
  cycleOpacity,
  exitPoint,
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

describe('createLivingParking', () => {
  const scene = (): THREE.Scene => new THREE.Scene()

  it('brings a lot to life with a small, capped pool', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(1))
    const group = s.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0)
    expect(group.children.length).toBeLessThanOrEqual(2) // per-lot cap
    lp.dispose()
  })

  it('caps the whole map at a dozen animated cars', () => {
    const s = scene()
    const lots = Array.from({ length: 20 }, (_, i) => square(120, i * 200, 0))
    const lp = createLivingParking(s, lots, flat, testRng(2))
    const group = s.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0)
    expect(group.children.length).toBeLessThanOrEqual(12)
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
    const ga = a.children[0] as THREE.Group
    const gb = b.children[0] as THREE.Group
    expect(ga.children.length).toBe(gb.children.length)
    expect(ga.children[0].position.x).toBeCloseTo(gb.children[0].position.x)
    expect(ga.children[0].position.z).toBeCloseTo(gb.children[0].position.z)
  })

  it('keeps every animated car inside its lot for the whole run', () => {
    const s = scene()
    const lp = createLivingParking(s, [lot], flat, testRng(5))
    const group = s.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0)
    for (let i = 0; i < 800; i++) {
      lp.update(0.1) // ~80s: several full cycles per car
      for (const car of group.children) {
        expect(pointInPolygon(car.position.x, car.position.z, lot), `${car.position.x},${car.position.z}`).toBe(true)
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
