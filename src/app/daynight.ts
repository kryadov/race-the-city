import * as THREE from 'three'
import type { Stage } from './scene'

interface Key {
  t: number
  sky: number
  sun: number
  sunI: number
  ambI: number
}

// Keyframes across the day (t: 0 = midnight, 0.5 = noon).
const KEYS: Key[] = [
  { t: 0.0, sky: 0x0a1024, sun: 0x33427a, sunI: 0.05, ambI: 0.18 }, // midnight
  { t: 0.24, sky: 0xf0a35e, sun: 0xffb070, sunI: 0.55, ambI: 0.4 }, // dawn
  { t: 0.5, sky: 0x9fc4e8, sun: 0xfff2d0, sunI: 1.2, ambI: 0.72 }, // noon
  { t: 0.76, sky: 0xdd7a4c, sun: 0xff9058, sunI: 0.55, ambI: 0.4 }, // dusk
  { t: 1.0, sky: 0x0a1024, sun: 0x33427a, sunI: 0.05, ambI: 0.18 }, // wraps to midnight
]

/**
 * The clock's mode: 'cycle' runs the full day/night loop; 'day' and 'night'
 * hold the sky fixed so you can drive in permanent noon or permanent midnight.
 */
export type TimeMode = 'cycle' | 'day' | 'night'
export const TIME_MODES: TimeMode[] = ['cycle', 'day', 'night']
/** The times the 'day' and 'night' locks hold at — noon, and deep midnight. */
export const DAY_TIME = 0.5
export const NIGHT_TIME = 0.0

/** Sun elevation from time: +1 at noon, -1 at midnight. Pure/testable. */
export function sunElevation(t: number): number {
  return Math.sin((t - 0.25) * Math.PI * 2)
}

const lerp = (a: number, b: number, x: number): number => a + (b - a) * x
function lerpColor(a: number, b: number, x: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (
    (Math.round(lerp(ar, br, x)) << 16) |
    (Math.round(lerp(ag, bg, x)) << 8) |
    Math.round(lerp(ab, bb, x))
  )
}

export interface DayNightSample {
  sky: number
  sun: number
  sunI: number
  ambI: number
}

/** Interpolated sky/sun/ambient values for a time in [0,1). Pure/testable. */
export function sampleDayNight(t: number): DayNightSample {
  const tt = ((t % 1) + 1) % 1
  let i = 0
  while (i < KEYS.length - 1 && tt > KEYS[i + 1].t) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const x = (tt - a.t) / (b.t - a.t || 1)
  return {
    sky: lerpColor(a.sky, b.sky, x),
    sun: lerpColor(a.sun, b.sun, x),
    sunI: lerp(a.sunI, b.sunI, x),
    ambI: lerp(a.ambI, b.ambI, x),
  }
}

/** Apply the time of day to the scene lights and (unless neon) sky/fog. */
export function applyDayNight(stage: Stage, t: number, neon: boolean): void {
  const s = sampleDayNight(t)
  const az = t * Math.PI * 2
  stage.sun.position.set(Math.cos(az) * 160, Math.max(-40, sunElevation(t) * 220), Math.sin(az) * 160)
  stage.sun.color.setHex(s.sun)
  stage.sun.intensity = s.sunI
  stage.ambient.intensity = s.ambI
  if (!neon) {
    ;(stage.scene.background as THREE.Color).setHex(s.sky)
    if (stage.scene.fog) (stage.scene.fog as THREE.Fog).color.setHex(s.sky)
  }
}
