import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createExcursion, nearestSight, timeBudget } from '../../src/app/excursion'
import type { Vec2 } from '../../src/geo/types'

const provider = { heightAt: () => 0 }

describe('nearestSight', () => {
  it('picks the nearest sight, skipping the one to avoid', () => {
    const sights: Vec2[] = [{ x: 10, z: 0 }, { x: 100, z: 0 }, { x: 5, z: 0 }]
    expect(nearestSight(sights, { x: 0, z: 0 }, null)).toBe(sights[2]) // (5,0) is nearest
    expect(nearestSight(sights, { x: 0, z: 0 }, sights[2])).toBe(sights[0]) // skip it → (10,0)
  })

  it('still returns a lone sight even when it is the one to avoid', () => {
    const only: Vec2[] = [{ x: 3, z: 4 }]
    expect(nearestSight(only, { x: 0, z: 0 }, only[0])).toBe(only[0])
  })

  it('returns null when there are no sights', () => {
    expect(nearestSight([], { x: 0, z: 0 }, null)).toBeNull()
  })
})

describe('timeBudget', () => {
  it('is generous with distance but never below the minimum', () => {
    expect(timeBudget({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeGreaterThanOrEqual(26)
    const near = timeBudget({ x: 0, z: 0 }, { x: 200, z: 0 })
    const far = timeBudget({ x: 0, z: 0 }, { x: 2000, z: 0 })
    expect(far).toBeGreaterThan(near)
  })
})

describe('excursion mode', () => {
  it('sets a first sight, then moves on to another when you reach it', () => {
    const ex = createExcursion(new THREE.Scene())
    ex.setEnabled(true)
    ex.reset([{ x: 200, z: 0 }, { x: -300, z: 0 }], provider, { x: 0, z: 0 })
    const first = ex.target()
    expect(first, 'no first sight was set').not.toBeNull()

    const s = ex.update(0.1, first!.x, first!.z) // drive onto it
    expect(s.justVisited).toBe(true)
    expect(s.visited).toBe(1)
    const next = ex.target()
    expect(next).not.toBeNull()
    expect(next).not.toBe(first) // a different sight now
  })

  it('fails a sight when the meter runs out, then offers another leg', () => {
    const ex = createExcursion(new THREE.Scene())
    ex.setEnabled(true)
    ex.reset([{ x: 500, z: 0 }, { x: -500, z: 0 }], provider, { x: 0, z: 0 })
    // sit still, far short of the sight, until the timer expires
    let failed = false
    for (let i = 0; i < 1000 && !failed; i++) failed = ex.update(1, 0, 0).justFailed
    expect(failed, 'the meter never ran out').toBe(true)
    expect(ex.state().visited).toBe(0)
  })

  it('is a no-op with no sights, and reports no target while off', () => {
    const ex = createExcursion(new THREE.Scene())
    ex.setEnabled(true)
    ex.reset([], provider, { x: 0, z: 0 })
    expect(ex.target()).toBeNull()

    ex.setEnabled(false)
    ex.reset([{ x: 10, z: 0 }], provider, { x: 0, z: 0 })
    expect(ex.target(), 'off should show no minimap target').toBeNull()
  })
})
