import type { VehicleType } from '../vehicle/vehicles'

export interface AudioState {
  sound: boolean
  music: boolean
  soundVol: number // 0..1
  musicVol: number // 0..1
  track: number // index into TRACKS
}

export interface Track {
  name: string
  /** Path under public/, served next to index.html. */
  file: string
}

// Real tracks, shipped in public/audio. Played like a radio: one at random on
// startup, another at random when it ends.
export const TRACKS: readonly Track[] = [
  { name: 'Code Pulse', file: 'audio/code-pulse.mp3' },
  { name: 'Lost Keygen', file: 'audio/lost-keygen.mp3' },
  { name: 'Sax and Fog', file: 'audio/sax-and-fog.mp3' },
  { name: 'Memory Disk', file: 'audio/memory-disk.mp3' },
  { name: 'Pixels Deflate', file: 'audio/pixels-deflate.mp3' },
  { name: 'Slow Error', file: 'audio/slow-error.mp3' },
]
export const TRACK_NAMES: readonly string[] = TRACKS.map((t) => t.name)

/**
 * Pick a track index at random, avoiding `current` so the radio never plays the
 * same thing twice in a row. Pass -1 for `current` to allow any track.
 */
export function pickTrack(count: number, current: number): number {
  if (count <= 1) return 0
  let n = current
  while (n === current) n = Math.floor(Math.random() * count)
  return n
}

const KEY = 'rtc.audio'
export const MUSIC_DEFAULTS: AudioState = { sound: true, music: true, soundVol: 0.6, musicVol: 0.35, track: 0 }
const DEFAULTS = MUSIC_DEFAULTS

/** How a given vehicle's engine sounds. */
export interface EngineProfile {
  base: number // idle frequency, Hz
  range: number // how much it climbs at full speed, Hz
  wave: OscillatorType
  cutoff: number // low-pass at idle, Hz — how muffled it is
  gain: number // relative loudness
}

const DIESEL: EngineProfile = { base: 34, range: 90, wave: 'sawtooth', cutoff: 130, gain: 1.15 }
const PETROL: EngineProfile = { base: 55, range: 210, wave: 'sawtooth', cutoff: 180, gain: 1 }
const RACE: EngineProfile = { base: 90, range: 470, wave: 'sawtooth', cutoff: 320, gain: 1.1 }
const SMALL: EngineProfile = { base: 42, range: 120, wave: 'square', cutoff: 150, gain: 0.7 }
const ELECTRIC: EngineProfile = { base: 160, range: 340, wave: 'triangle', cutoff: 900, gain: 0.5 }
const TURBINE: EngineProfile = { base: 120, range: 260, wave: 'triangle', cutoff: 600, gain: 0.75 }

/**
 * Engine character per vehicle. A tiller and a formula car both ran the same
 * 55Hz sawtooth before this; the point is only that they read as different
 * machines, so vehicles group onto a handful of shared profiles.
 */
const ENGINES: Partial<Record<VehicleType, EngineProfile>> = {
  racecar: RACE,
  sports: { base: 75, range: 380, wave: 'sawtooth', cutoff: 260, gain: 1.05 },
  motorbike: { base: 70, range: 330, wave: 'sawtooth', cutoff: 240, gain: 0.9 },
  ev: ELECTRIC,
  hover: TURBINE,
  truck: DIESEL,
  lorry: DIESEL,
  bus: DIESEL,
  tanker: DIESEL,
  crane: DIESEL,
  combine: { base: 36, range: 80, wave: 'sawtooth', cutoff: 120, gain: 1.1 },
  tractor: { base: 40, range: 95, wave: 'sawtooth', cutoff: 130, gain: 1 },
  roller: { base: 32, range: 60, wave: 'sawtooth', cutoff: 110, gain: 1 },
  tracked: { base: 38, range: 110, wave: 'sawtooth', cutoff: 140, gain: 1.15 },
  tiller: SMALL,
  retro: { base: 50, range: 160, wave: 'triangle', cutoff: 165, gain: 0.95 },
}

/** The engine profile for a vehicle; ordinary cars fall back to the petrol one. */
export function engineProfile(type: VehicleType): EngineProfile {
  return ENGINES[type] ?? PETROL
}

/** Engine oscillator frequency (Hz) from a 0..1 speed fraction. Pure/testable. */
export function engineFrequency(speedFraction: number, profile: EngineProfile = PETROL): number {
  const f = Math.max(0, Math.min(1, speedFraction))
  return profile.base + f * profile.range
}

/** Seconds parked before the engine starts fading out. */
export const IDLE_MUTE_AFTER = 10
const IDLE_FADE = 1.5 // seconds to fade to silence once past it

/** How far music drops while paused. */
const DUCK = 0.25

/**
 * Engine loudness from how long the car has sat still. An idle drone is tiring
 * when you're parked reading the map, so it fades out — and comes straight back
 * on the throttle, because the caller resets the timer.
 */
export function idleGain(idleSeconds: number): number {
  if (idleSeconds <= IDLE_MUTE_AFTER) return 1
  return Math.max(0, 1 - (idleSeconds - IDLE_MUTE_AFTER) / IDLE_FADE)
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
 * Web Audio engine: a synthesized speed-driven engine tone, slip-driven skid
 * noise and collision thud, plus music played from real files. Must be resumed
 * from a user gesture (autoplay policy).
 *
 * Music — built-in tracks and a user-supplied file alike — runs through ONE
 * <audio> element routed into musicGain, so the music toggle and volume slider
 * govern both. Switching tracks only swaps `src`, which keeps the element's
 * MediaElementSourceNode valid (it can be created only once per element).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private skidGain: GainNode | null = null
  private engine: EngineProfile = PETROL
  private ducked = false // music pulled down (pause), without touching the user's volume
  private idleFor = 0 // seconds the car has sat still, for the idle fade
  private hornOsc: OscillatorNode | null = null
  private hornOsc2: OscillatorNode | null = null
  private state: AudioState = loadState()
  private musicEl: HTMLAudioElement | null = null
  private musicSrc: MediaElementAudioSourceNode | null = null
  // A user-supplied file, looped in place of the built-in tracks. Session-only:
  // a File can't be persisted, so it resets on reload.
  private customUrl: string | null = null
  private customName = ''

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
    this.connectMusic() // a custom file picked before the context existed
    this.applyVolumes()
    // Radio: start on a random track rather than always the same one.
    if (!this.customUrl) this.playTrack(pickTrack(TRACKS.length, -1))
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
    this.engineOsc.type = this.engine.wave
    this.engineOsc.frequency.value = this.engine.base
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

  /** Switch the engine's character. Call when the player picks a vehicle. */
  setVehicle(type: VehicleType): void {
    this.engine = engineProfile(type)
    this.idleFor = 0
    if (this.engineOsc) this.engineOsc.type = this.engine.wave
  }

  /**
   * @param speedFraction 0..1 of the vehicle's top speed
   * @param dt seconds since the last frame
   * @param active whether the car is moving or being driven — parking mutes it
   */
  updateEngine(speedFraction: number, dt: number, active: boolean): void {
    this.idleFor = active ? 0 : this.idleFor + dt
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return
    const now = this.ctx.currentTime
    const p = this.engine
    this.engineOsc.frequency.setTargetAtTime(engineFrequency(speedFraction, p), now, 0.05)
    // Filter opens up with revs; overall level is low and near-silent at idle.
    this.engineFilter.frequency.setTargetAtTime(p.cutoff + speedFraction * 1000, now, 0.08)
    const level = (0.015 + speedFraction * 0.07) * p.gain * idleGain(this.idleFor)
    this.engineGain.gain.setTargetAtTime(level, now, 0.1)
  }

  /**
   * Duck the music down while paused rather than stopping it — the track keeps
   * its place, and the user's volume setting is left alone.
   */
  setDucked(on: boolean): void {
    if (on === this.ducked) return
    this.ducked = on
    this.applyVolumes()
  }

  /** Cut the engine now, without waiting out the idle fade — used by pause. */
  silenceEngine(): void {
    if (!this.ctx || !this.engineGain) return
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
  }

  /** A two-tone horn. */
  horn(on: boolean): void {
    if (!this.ctx || !this.sfxGain) return
    if (!on) {
      this.hornOsc?.stop()
      this.hornOsc2?.stop()
      this.hornOsc = null
      this.hornOsc2 = null
      return
    }
    if (this.hornOsc) return // already sounding; don't stack them
    const ctx = this.ctx
    const t = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    g.connect(this.sfxGain)
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 440
    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = 554 // a third above: a car horn, not a test tone
    osc.connect(g)
    osc2.connect(g)
    osc.start(t)
    osc2.start(t)
    this.hornOsc = osc
    this.hornOsc2 = osc2
  }

  /** A bright ping for taking a checkpoint. */
  chime(high = false): void {
    if (!this.ctx || !this.sfxGain) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(high ? 880 : 660, t)
    osc.frequency.exponentialRampToValueAtTime(high ? 1320 : 990, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.22, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(g)
    g.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + 0.36)
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

  /** The one <audio> element all music flows through, created on first use. */
  private ensureEl(): HTMLAudioElement {
    if (!this.musicEl) {
      this.musicEl = new Audio()
      // Radio: when a built-in track finishes, roll on to another one.
      this.musicEl.addEventListener('ended', () => {
        if (!this.customUrl) this.setState({ track: pickTrack(TRACKS.length, this.state.track) })
      })
    }
    return this.musicEl
  }

  private connectMusic(): void {
    if (!this.ctx || !this.musicGain || !this.musicEl || this.musicSrc) return
    this.musicSrc = this.ctx.createMediaElementSource(this.musicEl)
    this.musicSrc.connect(this.musicGain)
  }

  /** Load and play a built-in track by index. */
  private playTrack(i: number): void {
    const track = TRACKS[i] ?? TRACKS[0]
    const el = this.ensureEl()
    el.loop = false // the 'ended' handler picks the next one
    el.src = track.file
    this.connectMusic()
    if (this.state.music) void el.play().catch(() => undefined)
  }

  /** The custom file's name, or null when playing the built-in tracks. */
  getCustomName(): string | null {
    return this.customUrl ? this.customName : null
  }

  /**
   * Loop a user-supplied audio file instead of the built-in tracks. Pass null to
   * go back to them. Shares the music element and gain, so the toggle and volume
   * slider keep working either way.
   */
  setCustomMusic(file: File | null): void {
    if (this.customUrl) {
      URL.revokeObjectURL(this.customUrl)
      this.customUrl = null
    }

    if (!file) {
      this.customName = ''
      this.playTrack(this.state.track) // back to the built-in radio
      return
    }

    this.customUrl = URL.createObjectURL(file)
    this.customName = file.name
    const el = this.ensureEl()
    el.loop = true // one file, so loop it rather than rolling on
    el.src = this.customUrl
    this.connectMusic()
    if (this.state.music) void el.play().catch(() => undefined)
  }

  private applyVolumes(): void {
    // Music is a real element: pause it rather than just muting the gain, so a
    // muted track doesn't keep streaming.
    if (this.musicEl?.src) {
      if (this.state.music) void this.musicEl.play().catch(() => undefined)
      else this.musicEl.pause()
    }
    if (!this.ctx || !this.sfxGain || !this.musicGain) return
    this.sfxGain.gain.value = this.state.sound ? this.state.soundVol : 0
    this.musicGain.gain.value = this.state.music ? this.state.musicVol * (this.ducked ? DUCK : 1) : 0
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
    if (trackChanged && this.ctx && !this.customUrl) this.playTrack(this.state.track)
  }
}
