import { describe, it, expect } from 'vitest'
import {
  engineFrequency,
  TRACKS,
  TRACK_NAMES,
  pickTrack,
  MUSIC_DEFAULTS,
  engineProfile,
  hornProfile,
  idleGain,
  IDLE_MUTE_AFTER,
} from '../../src/audio/audio'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('engine character', () => {
  it('gives every vehicle a profile', () => {
    for (const type of VEHICLE_TYPES) {
      const p = engineProfile(type)
      expect(p.base, type).toBeGreaterThan(0)
      expect(p.range, type).toBeGreaterThan(0)
    }
  })

  it('makes a racecar scream and a tiller putter', () => {
    const race = engineProfile('racecar')
    const tiller = engineProfile('tiller')
    // at full chat the racecar must sit well above the tiller
    expect(engineFrequency(1, race)).toBeGreaterThan(engineFrequency(1, tiller) * 2)
  })

  it('keeps the heavy diesels below the cars', () => {
    for (const heavy of ['lorry', 'bus', 'tanker', 'crane'] as const) {
      expect(engineFrequency(0, engineProfile(heavy)), heavy).toBeLessThan(
        engineFrequency(0, engineProfile('car')),
      )
    }
  })

  it('still rises with speed and clamps, whatever the vehicle', () => {
    for (const type of VEHICLE_TYPES) {
      const p = engineProfile(type)
      expect(engineFrequency(1, p), type).toBeGreaterThan(engineFrequency(0, p))
      expect(engineFrequency(5, p), type).toBeCloseTo(engineFrequency(1, p))
      expect(engineFrequency(-5, p), type).toBeCloseTo(engineFrequency(0, p))
    }
  })
})

describe('horn character', () => {
  it('gives every vehicle a two-tone horn with positive gain', () => {
    for (const type of VEHICLE_TYPES) {
      const h = hornProfile(type)
      expect(h.a, type).toBeGreaterThan(0)
      expect(h.b, type).toBeGreaterThan(h.a) // the upper tone sits above the lower
      expect(h.gain, type).toBeGreaterThan(0)
    }
  })

  it('sounds a plain car the classic two-tone, unlisted vehicles included', () => {
    const car = hornProfile('car')
    expect(car.a).toBe(440)
    expect(car.b).toBe(554)
  })

  it('blasts a deep lorry horn and squeaks a bike, either side of the car', () => {
    expect(hornProfile('lorry').a).toBeLessThan(hornProfile('car').a) // deeper
    expect(hornProfile('motorbike').a).toBeGreaterThan(hornProfile('car').a) // higher
    // and the lorry is the louder of the two
    expect(hornProfile('lorry').gain).toBeGreaterThan(hornProfile('motorbike').gain)
  })
})

describe('idleGain', () => {
  it('holds the engine at full while it has been idle only briefly', () => {
    expect(idleGain(0)).toBe(1)
    expect(idleGain(IDLE_MUTE_AFTER - 0.1)).toBe(1)
  })

  it('fades the engine out once parked past the threshold', () => {
    expect(idleGain(IDLE_MUTE_AFTER + 0.5)).toBeLessThan(1)
    expect(idleGain(IDLE_MUTE_AFTER + 0.5)).toBeGreaterThan(0)
  })

  it('reaches silence and stays there', () => {
    expect(idleGain(IDLE_MUTE_AFTER + 10)).toBe(0)
    expect(idleGain(9999)).toBe(0)
  })

  it('never goes negative', () => {
    for (let t = 0; t < 60; t += 0.37) expect(idleGain(t)).toBeGreaterThanOrEqual(0)
  })
})

describe('music tracks', () => {
  it('ships real audio files, not procedural loops', () => {
    expect(TRACKS.length).toBeGreaterThan(1)
    for (const t of TRACKS) {
      expect(t.name.length, t.file).toBeGreaterThan(0)
      expect(t.file, t.name).toMatch(/^audio\/[a-z0-9-]+\.mp3$/)
    }
  })

  it('exposes a name per track, in order', () => {
    expect(TRACK_NAMES).toEqual(TRACKS.map((t) => t.name))
  })

  it('plays music by default now that the tracks are real', () => {
    expect(MUSIC_DEFAULTS.music).toBe(true)
  })

  it('picks a track in range', () => {
    for (let i = 0; i < 50; i++) {
      const n = pickTrack(TRACKS.length, -1)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(TRACKS.length)
    }
  })

  it('never repeats the track that just finished', () => {
    // radio behaviour: hearing the same song twice in a row reads as a bug
    for (let cur = 0; cur < TRACKS.length; cur++) {
      for (let i = 0; i < 30; i++) expect(pickTrack(TRACKS.length, cur)).not.toBe(cur)
    }
  })

  it('has nowhere else to go with a single track', () => {
    expect(pickTrack(1, 0)).toBe(0)
  })
})

describe('engineFrequency', () => {
  it('idles low and rises with speed', () => {
    expect(engineFrequency(0)).toBeCloseTo(55)
    expect(engineFrequency(1)).toBeCloseTo(265)
    expect(engineFrequency(0.5)).toBeGreaterThan(engineFrequency(0.1))
  })

  it('clamps out-of-range speed fractions', () => {
    expect(engineFrequency(2)).toBeCloseTo(265)
    expect(engineFrequency(-1)).toBeCloseTo(55)
  })
})
