import { describe, it, expect, vi, afterEach } from 'vitest'
import { weatherFromCode, fetchCityWeather } from '../../src/app/liveWeather'

describe('weatherFromCode (WMO code → game weather)', () => {
  it('reads clear and cloudy codes as clear', () => {
    for (const c of [0, 1, 2, 3]) expect(weatherFromCode(c)).toBe('clear')
  })
  it('reads the two fog codes as fog', () => {
    expect(weatherFromCode(45)).toBe('fog')
    expect(weatherFromCode(48)).toBe('fog')
  })
  it('reads drizzle, rain, freezing rain, showers and thunder as rain', () => {
    for (const c of [51, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) expect(weatherFromCode(c)).toBe('rain')
  })
  it('reads snow and snow showers as snow', () => {
    for (const c of [71, 73, 75, 77, 85, 86]) expect(weatherFromCode(c)).toBe('snow')
  })
  it('falls back to clear for anything unexpected', () => {
    expect(weatherFromCode(999)).toBe('clear')
    expect(weatherFromCode(-1)).toBe('clear')
  })
})

describe('fetchCityWeather (best-effort, never throws)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps a good current-weather response to a Weather', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ current: { weather_code: 63 } }) })))
    expect(await fetchCityWeather(51.5, -0.12)).toBe('rain')
  })
  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    expect(await fetchCityWeather(0, 0)).toBeNull()
  })
  it('returns null when the fetch throws (offline / aborted)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    expect(await fetchCityWeather(0, 0)).toBeNull()
  })
  it('returns null when the payload has no numeric code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ current: {} }) })))
    expect(await fetchCityWeather(0, 0)).toBeNull()
  })
})
