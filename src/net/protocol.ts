import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'

/**
 * What goes over the wire. Two messages, deliberately unlike each other:
 *
 * - `hello` is sent once, on open, and is JSON — it is rare and wants to be
 *   readable when something goes wrong.
 * - `pose` is the hot path at ~18 Hz and is a fixed 24-byte Float32Array. It
 *   rides an unreliable channel, so a lost or late pose is simply dropped; the
 *   next one supersedes it.
 */

export interface Pose {
  x: number
  y: number
  z: number
  /** Radians, the car's `heading` straight out of `CarState`. */
  heading: number
  /** Metres per second — drives the remote car's wheel spin. */
  speed: number
  /** −1..1 — drives the remote car's front-wheel angle. */
  steer: number
}

export interface Hello {
  t: 'hello'
  name: string
  vehicle: VehicleType
}

/** Six float32s. */
export const POSE_BYTES = 24
/** Longest player name we carry; longer is cut on receipt. */
export const NAME_MAX = 24

export function encodePose(p: Pose): ArrayBuffer {
  const a = new Float32Array([p.x, p.y, p.z, p.heading, p.speed, p.steer])
  return a.buffer
}

export function decodePose(buf: ArrayBuffer): Pose | null {
  if (buf.byteLength !== POSE_BYTES) return null
  const a = new Float32Array(buf)
  return { x: a[0], y: a[1], z: a[2], heading: a[3], speed: a[4], steer: a[5] }
}

export function encodeHello(h: Hello): string {
  return JSON.stringify(h)
}

export function decodeHello(s: string): Hello | null {
  let v: unknown
  try {
    v = JSON.parse(s)
  } catch {
    return null
  }
  const h = v as Partial<Hello>
  if (!h || typeof h !== 'object' || h.t !== 'hello') return null
  if (typeof h.name !== 'string') return null
  if (typeof h.vehicle !== 'string' || !VEHICLE_TYPES.includes(h.vehicle as VehicleType)) return null
  return { t: 'hello', name: h.name.slice(0, NAME_MAX), vehicle: h.vehicle as VehicleType }
}

/** Signed shortest way from `a` to `b` around the wrap, in radians. */
function shortest(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Blend two poses. Position and the scalars go linearly; heading takes the short
 * way round so a car crossing north doesn't spin 350° the wrong way.
 */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    heading: a.heading + shortest(a.heading, b.heading) * k,
    speed: a.speed + (b.speed - a.speed) * k,
    steer: a.steer + (b.steer - a.steer) * k,
  }
}
