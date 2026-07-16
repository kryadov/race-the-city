export interface AudioState {
  sound: boolean
  music: boolean
  soundVol: number // 0..1
  musicVol: number // 0..1
  track: number // index into TRACKS
}

interface Track {
  name: string
  notes: number[]
  stepDur: number
  wave: OscillatorType
}

// Mellow, distinct procedural loops (kept to gentle waveforms).
const TRACKS: Track[] = [
  { name: 'Cruise', notes: [220, 277.2, 329.6, 277.2, 246.9, 329.6, 293.7, 246.9], stepDur: 0.28, wave: 'triangle' },
  { name: 'Chill', notes: [196, 246.9, 293.7, 246.9, 220, 261.6, 329.6, 261.6], stepDur: 0.44, wave: 'sine' },
  { name: 'Upbeat', notes: [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2], stepDur: 0.18, wave: 'triangle' },
]
export const TRACK_NAMES: readonly string[] = TRACKS.map((t) => t.name)

const KEY = 'rtc.audio'
const DEFAULTS: AudioState = { sound: true, music: false, soundVol: 0.6, musicVol: 0.35, track: 0 }

/** Engine oscillator frequency (Hz) from a 0..1 speed fraction. Pure/testable. */
export function engineFrequency(speedFraction: number): number {
  const f = Math.max(0, Math.min(1, speedFraction))
  return 55 + f * 210
}

function loadState(): AudioState {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return { ...DEFAULTS, ...(JSON.parse(s) as Partial<AudioState>) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

/**
 * Web Audio engine: a speed-driven engine tone, a slip-driven skid noise, a
 * collision thud, and a small procedural music loop. Everything is synthesized
 * — no audio assets. Must be resumed from a user gesture (autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private skidGain: GainNode | null = null
  private musicStep = 0
  private musicTimer: number | null = null
  private state: AudioState = loadState()

  getState(): AudioState {
    return { ...this.state }
  }

  /** Create/resume the AudioContext. Call from a click/keydown handler. */
  resume(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.build()
    this.applyVolumes()
    this.startMusic()
  }

  private build(): void {
    const ctx = this.ctx!
    this.sfxGain = ctx.createGain()
    this.sfxGain.connect(ctx.destination)
    this.musicGain = ctx.createGain()
    this.musicGain.connect(ctx.destination)

    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineGain.connect(this.sfxGain)
    // Low-pass tames the harsh sawtooth harmonics into a mellow hum.
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 200
    this.engineFilter.Q.value = 0.6
    this.engineFilter.connect(this.engineGain)
    this.engineOsc = ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc.frequency.value = 55
    this.engineOsc.connect(this.engineFilter)
    this.engineOsc.start()

    this.skidGain = ctx.createGain()
    this.skidGain.gain.value = 0
    this.skidGain.connect(this.sfxGain)
    const noise = ctx.createBufferSource()
    noise.buffer = this.whiteNoise()
    noise.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 950
    bp.Q.value = 0.9
    noise.connect(bp)
    bp.connect(this.skidGain)
    noise.start()
  }

  private whiteNoise(): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * 0.5)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  updateEngine(speedFraction: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return
    const now = this.ctx.currentTime
    this.engineOsc.frequency.setTargetAtTime(engineFrequency(speedFraction), now, 0.05)
    // Filter opens up with revs; overall level is low and near-silent at idle.
    this.engineFilter.frequency.setTargetAtTime(180 + speedFraction * 1000, now, 0.08)
    this.engineGain.gain.setTargetAtTime(0.015 + speedFraction * 0.07, now, 0.1)
  }

  updateSkid(slipFraction: number): void {
    if (!this.ctx || !this.skidGain) return
    // Silent through gentle cornering; only real slides screech, and softly.
    const over = Math.max(0, slipFraction - 0.4)
    const g = Math.min(0.09, over * 0.18)
    this.skidGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.06)
  }

  thud(): void {
    if (!this.ctx || !this.sfxGain) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.connect(g)
    g.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + 0.26)
  }

  private startMusic(): void {
    const track = TRACKS[this.state.track] ?? TRACKS[0]
    const tick = (): void => {
      if (!this.ctx || !this.musicGain) return
      const t = this.ctx.currentTime + 0.05
      const osc = this.ctx.createOscillator()
      osc.type = track.wave
      osc.frequency.value = track.notes[this.musicStep % track.notes.length]
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + track.stepDur * 0.9)
      osc.connect(g)
      g.connect(this.musicGain)
      osc.start(t)
      osc.stop(t + track.stepDur)
      this.musicStep++
    }
    this.musicTimer = window.setInterval(tick, track.stepDur * 1000)
  }

  private restartMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer)
    this.musicStep = 0
    this.startMusic()
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return
    this.sfxGain.gain.value = this.state.sound ? this.state.soundVol : 0
    this.musicGain.gain.value = this.state.music ? this.state.musicVol : 0
  }

  setState(patch: Partial<AudioState>): void {
    const trackChanged = patch.track !== undefined && patch.track !== this.state.track
    this.state = { ...this.state, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state))
    } catch {
      /* ignore */
    }
    this.applyVolumes()
    if (trackChanged && this.ctx) this.restartMusic()
  }
}
