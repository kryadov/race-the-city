import { describe, it, expect } from 'vitest'
import { hoverTilt, hoverBob } from '../../src/app/scene'

describe('hoverTilt', () => {
  it('is level at a standstill', () => {
    expect(hoverTilt(0)).toBeCloseTo(0) // (−0, in fact — no pitch either way)
  })

  it('pitches nose-DOWN moving forward, nose-UP in reverse', () => {
    // RIGHT_AXIS positive is nose-up (see the flip), so nose-down is a NEGATIVE
    // angle. Forward travel must tip the nose down; reverse tips it up.
    expect(hoverTilt(10)).toBeLessThan(0)
    expect(hoverTilt(-10)).toBeGreaterThan(0)
  })

  it('grows with speed but caps, so a fast run never stands it on its nose', () => {
    expect(Math.abs(hoverTilt(20))).toBeGreaterThan(Math.abs(hoverTilt(5)))
    // Way past any real speed, the magnitude is still the cap, not more.
    expect(Math.abs(hoverTilt(1000))).toBeCloseTo(0.26)
    expect(Math.abs(hoverTilt(1000))).toBeLessThanOrEqual(0.26 + 1e-9)
  })
})

describe('hoverBob', () => {
  it('wobbles up and down around zero at a dead hover', () => {
    // Sampled across a full period, the bob swings both positive and negative.
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t < 4; t += 0.05) {
      const b = hoverBob(t, 0)
      min = Math.min(min, b)
      max = Math.max(max, b)
    }
    expect(max).toBeGreaterThan(0.05)
    expect(min).toBeLessThan(-0.05)
  })

  it('fades out as the craft picks up speed', () => {
    // At a quarter period the sine is at its peak; the peak shrinks with speed and
    // is gone by the fade speed (4 m/s).
    const peakT = (Math.PI / 2) / 2.4 // clock where sin(clock*RATE) = 1
    const still = hoverBob(peakT, 0)
    const moving = hoverBob(peakT, 2)
    expect(still).toBeGreaterThan(moving)
    expect(hoverBob(peakT, 4)).toBeCloseTo(0)
    expect(hoverBob(peakT, 8)).toBe(0) // clamped, never negative fade
  })
})
