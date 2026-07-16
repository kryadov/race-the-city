import { describe, it, expect } from 'vitest'
import { engineFrequency, TRACKS, TRACK_NAMES, pickTrack, MUSIC_DEFAULTS } from '../../src/audio/audio'

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
