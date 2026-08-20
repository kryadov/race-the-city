import { describe, it, expect } from 'vitest'
import {
  encodePose, decodePose, encodeHello, decodeHello, lerpPose, POSE_BYTES, type Pose,
} from '../../src/net/protocol'

const POSE: Pose = { x: 12.5, y: 3.25, z: -407.75, heading: 1.5, speed: 18.5, steer: -0.5 }

describe('protocol / pose', () => {
  it('round-trips a pose through the binary form', () => {
    const back = decodePose(encodePose(POSE))
    expect(back).toEqual(POSE) // every value above is exact in float32
  })

  it('is a fixed 24 bytes — six float32s', () => {
    expect(POSE_BYTES).toBe(24)
    expect(encodePose(POSE).byteLength).toBe(24)
  })

  it('rejects a buffer of the wrong size', () => {
    expect(decodePose(new ArrayBuffer(0))).toBeNull()
    expect(decodePose(new ArrayBuffer(23))).toBeNull()
    expect(decodePose(new ArrayBuffer(48))).toBeNull()
  })
})

describe('protocol / hello', () => {
  it('round-trips a hello', () => {
    expect(decodeHello(encodeHello({ t: 'hello', name: 'Костя', vehicle: 'sports' }))).toEqual({
      t: 'hello', name: 'Костя', vehicle: 'sports',
    })
  })

  it('rejects junk, a wrong tag, and an unknown vehicle', () => {
    expect(decodeHello('nonsense')).toBeNull()
    expect(decodeHello(JSON.stringify({ t: 'pose', name: 'A', vehicle: 'car' }))).toBeNull()
    expect(decodeHello(JSON.stringify({ t: 'hello', name: 'A', vehicle: 'spaceship' }))).toBeNull()
  })

  it('clamps an over-long name rather than rejecting it', () => {
    const long = 'x'.repeat(200)
    const back = decodeHello(encodeHello({ t: 'hello', name: long, vehicle: 'car' }))
    expect(back?.name.length).toBe(24)
  })
})

describe('protocol / lerpPose', () => {
  it('returns the ends at t=0 and t=1', () => {
    const b: Pose = { ...POSE, x: 100 }
    expect(lerpPose(POSE, b, 0)).toEqual(POSE)
    expect(lerpPose(POSE, b, 1)).toEqual(b)
  })

  it('interpolates position linearly', () => {
    const b: Pose = { ...POSE, x: POSE.x + 10, z: POSE.z + 4 }
    const mid = lerpPose(POSE, b, 0.5)
    expect(mid.x).toBeCloseTo(POSE.x + 5, 6)
    expect(mid.z).toBeCloseTo(POSE.z + 2, 6)
  })

  it('turns the short way round the wrap, not the long way', () => {
    // 350° → 10° must pass through 0°, i.e. +20°, never -340°.
    const a: Pose = { ...POSE, heading: (350 * Math.PI) / 180 }
    const b: Pose = { ...POSE, heading: (10 * Math.PI) / 180 }
    const mid = lerpPose(a, b, 0.5)
    const deg = ((mid.heading * 180) / Math.PI + 360) % 360
    expect(Math.min(deg, 360 - deg)).toBeLessThan(1e-6) // ≈ 0°/360°
  })

  it('clamps t outside 0..1', () => {
    const b: Pose = { ...POSE, x: POSE.x + 10 }
    expect(lerpPose(POSE, b, -1).x).toBe(POSE.x)
    expect(lerpPose(POSE, b, 5).x).toBe(b.x)
  })
})
