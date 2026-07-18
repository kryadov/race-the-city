import { describe, it, expect } from 'vitest'
import { createReplay } from '../../src/app/replay'

describe('replay', () => {
  it('records a drive and plays it back along the same path', () => {
    const r = createReplay()
    r.startRec()
    for (let i = 0; i < 60; i++) r.capture({ x: i * 2, z: 0, y: 0, heading: 0 }, 1 / 30)
    r.stopRec()
    expect(r.hasClip()).toBe(true)

    r.play()
    expect(r.playing()).toBe(true)
    let last = -1
    let sawFar = false
    for (let i = 0; i < 90; i++) {
      const p = r.step(1 / 30)
      if (!p) continue
      expect(p.z).toBeCloseTo(0) // stayed on the recorded line
      expect(p.x).toBeGreaterThanOrEqual(last - 1e-6) // moving forward, not jumping about
      last = p.x
      if (p.x > 60) sawFar = true
    }
    expect(sawFar).toBe(true)
    expect(r.playing()).toBe(false) // ran to the end and stopped
  })

  it('will not play without a clip', () => {
    const r = createReplay()
    r.play()
    expect(r.playing()).toBe(false)
    expect(r.step(0.1)).toBeNull()
  })

  it('interpolates heading the short way round', () => {
    const r = createReplay()
    r.startRec()
    r.capture({ x: 0, z: 0, y: 0, heading: 3.0 }, 1)
    r.capture({ x: 1, z: 0, y: 0, heading: -3.0 }, 1)
    r.stopRec()
    r.play()
    const p = r.step(1.5) // midway between the two samples (t≈1.5, samples at t=1 and t=2)
    // 3.0 → −3.0 the short way crosses ±π (~3.14), not back through 0
    expect(Math.abs(p!.heading)).toBeGreaterThan(3.0)
  })

  it('clears its clip (the poses belong to one city)', () => {
    const r = createReplay()
    r.startRec()
    for (let i = 0; i < 10; i++) r.capture({ x: i, z: 0, y: 0, heading: 0 }, 1 / 20)
    r.stopRec()
    expect(r.hasClip()).toBe(true)
    r.clear()
    expect(r.hasClip()).toBe(false)
  })
})
