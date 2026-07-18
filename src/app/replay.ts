/**
 * Trip recorder + playback, pose-based.
 *
 * Recording the car's *pose* (position, height, heading) a few dozen times a
 * second — not its inputs — makes replay robust: it doesn't depend on the sim
 * being deterministic (traffic, weather and nitro all roll their own dice), it
 * just retraces where the car actually went. Playback interpolates between the
 * samples so it's smooth however coarse the capture rate.
 */

export interface Pose {
  x: number
  z: number
  y: number
  heading: number
}

interface Sample extends Pose {
  t: number // seconds from the start of the recording
}

/** How often a pose is captured, seconds. 25Hz is smooth and cheap to store. */
const INTERVAL = 1 / 25
/** A cap so a forgotten recording can't grow without bound — ~6 minutes at 25Hz. */
const MAX_SAMPLES = 9000

export interface Replay {
  recording(): boolean
  playing(): boolean
  hasClip(): boolean
  /** Seconds recorded (while recording) or the clip's length. */
  duration(): number
  startRec(): void
  stopRec(): void
  /** While recording, feed the car's pose each frame. */
  capture(pose: Pose, dt: number): void
  /** Begin playing the stored clip from the top. No-op without a clip. */
  play(): void
  stopPlay(): void
  /** Advance playback by dt and return the interpolated pose, or null at the end. */
  step(dt: number): Pose | null
  /** Drop the clip and any recording — the poses belong to one city. */
  clear(): void
}

const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f
/** Shortest-path angle interpolation, so heading doesn't spin the long way round. */
function lerpAngle(a: number, b: number, f: number): number {
  return a + norm(b - a) * f
}

export function createReplay(): Replay {
  let clip: Sample[] = []
  let buf: Sample[] = []
  let rec = false
  let recT = 0
  let lastSample = -Infinity

  let play = false
  let playT = 0
  let idx = 0

  const clipLen = (s: Sample[]): number => (s.length ? s[s.length - 1].t : 0)

  return {
    recording: () => rec,
    playing: () => play,
    hasClip: () => clip.length > 1,
    duration: () => (rec ? recT : clipLen(clip)),
    startRec() {
      rec = true
      play = false
      buf = []
      recT = 0
      lastSample = -Infinity
    },
    stopRec() {
      if (!rec) return
      rec = false
      if (buf.length > 1) clip = buf // keep the last real drive; a tap-and-stop isn't one
      buf = []
    },
    capture(pose, dt) {
      if (!rec) return
      recT += dt
      if (recT - lastSample < INTERVAL) return
      lastSample = recT
      if (buf.length < MAX_SAMPLES) buf.push({ t: recT, x: pose.x, z: pose.z, y: pose.y, heading: pose.heading })
    },
    play() {
      if (clip.length < 2) return
      play = true
      rec = false
      playT = 0
      idx = 0
    },
    stopPlay() {
      play = false
    },
    clear() {
      clip = []
      buf = []
      rec = false
      play = false
    },
    step(dt) {
      if (!play || clip.length < 2) return null
      playT += dt
      const end = clip[clip.length - 1].t
      if (playT >= end) {
        play = false
        return null
      }
      // advance the cursor to the segment containing playT
      while (idx < clip.length - 2 && clip[idx + 1].t <= playT) idx++
      const a = clip[idx]
      const b = clip[idx + 1]
      const span = b.t - a.t
      const f = span > 1e-6 ? (playT - a.t) / span : 0
      return {
        x: lerp(a.x, b.x, f),
        z: lerp(a.z, b.z, f),
        y: lerp(a.y, b.y, f),
        heading: lerpAngle(a.heading, b.heading, f),
      }
    },
  }
}
