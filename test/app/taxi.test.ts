import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTaxi, fareValue, timeBudget } from '../../src/app/taxi'
import type { Road } from '../../src/geo/types'

const provider = { heightAt: () => 0 }

/** A dense grid of drivable points, spread wide enough for fares to be chosen. */
function roads(): Road[] {
  const points = []
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) points.push({ x: i * 80 - 760, z: j * 80 - 760 })
  return [{ points, kind: 'residential' }]
}

/** Deterministic PRNG (mulberry32) so a fare layout is reproducible. */
function makeRand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('taxi mode', () => {
  it('picks up, then delivers, chaining into a new fare', () => {
    const taxi = createTaxi(new THREE.Scene(), makeRand(1))
    taxi.setEnabled(true)
    taxi.reset(roads(), provider, { x: 0, z: 0 })

    expect(taxi.state().phase).toBe('toPickup')
    const pickup = taxi.target()
    expect(pickup).not.toBeNull()

    // drive onto the pickup marker
    const s1 = taxi.update(0.1, pickup!.x, pickup!.z)
    expect(s1.phase).toBe('toDropoff') // passenger's aboard
    const dropoff = taxi.target()
    expect(dropoff).not.toBeNull()

    // and onto the drop-off
    const s2 = taxi.update(0.1, dropoff!.x, dropoff!.z)
    expect(s2.justDelivered).toBe(true)
    expect(s2.fares).toBe(1)
    expect(s2.earnings).toBeGreaterThan(0)
    // a fresh fare is waiting
    expect(taxi.state().phase).toBe('toPickup')
    expect(taxi.target()).not.toBeNull()
  })

  it('fails a fare when the meter runs out, then offers another', () => {
    const taxi = createTaxi(new THREE.Scene(), makeRand(7))
    taxi.setEnabled(true)
    taxi.reset(roads(), provider, { x: 0, z: 0 })

    let sawFail = false
    for (let i = 0; i < 800; i++) {
      const s = taxi.update(0.1, 0, 0) // never move — never reach the marker (it's ≥120m off)
      if (s.justFailed) { sawFail = true; break }
    }
    expect(sawFail).toBe(true)
    expect(taxi.enabled()).toBe(true)
    expect(taxi.target()).not.toBeNull()
  })

  it('does nothing while disabled', () => {
    const taxi = createTaxi(new THREE.Scene(), makeRand(3))
    taxi.reset(roads(), provider, { x: 0, z: 0 })
    const s = taxi.update(0.1, 0, 0)
    expect(s.active).toBe(false)
    expect(taxi.target()).toBeNull()
  })
})

describe('taxi economics', () => {
  it('pays more for a longer trip', () => {
    expect(fareValue({ x: 0, z: 0 }, { x: 900, z: 0 })).toBeGreaterThan(fareValue({ x: 0, z: 0 }, { x: 90, z: 0 }))
  })
  it('budgets more time for a longer trip, with a floor', () => {
    expect(timeBudget({ x: 0, z: 0 }, { x: 0, z: 0 })).toBeGreaterThanOrEqual(22)
    expect(timeBudget({ x: 0, z: 0 }, { x: 2000, z: 0 })).toBeGreaterThan(timeBudget({ x: 0, z: 0 }, { x: 200, z: 0 }))
  })
})
