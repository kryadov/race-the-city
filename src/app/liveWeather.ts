import type { Weather } from './weather'

/** Give up on a hung request after this long — the game must never wait on weather. */
const TIMEOUT_MS = 6000
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

/**
 * Map a WMO weather-interpretation code (Open-Meteo's `weather_code`) to the game's
 * four weather states. We have no distinct "cloudy", so clear/cloudy codes all read
 * as clear; drizzle/rain/showers/thunder are rain; snow and snow showers are snow;
 * the two fog codes are fog.
 *
 * WMO table: 0 clear · 1–3 mainly clear→overcast · 45/48 fog · 51–57 drizzle ·
 * 61–67 rain (incl. freezing) · 71–77 snow · 80–82 rain showers · 85–86 snow
 * showers · 95–99 thunderstorm.
 */
export function weatherFromCode(code: number): Weather {
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain'
  return 'clear'
}

/**
 * The current weather over a city, from Open-Meteo (keyless, CORS-friendly, no
 * backend of ours). Fully async and side-effect-free; returns null on any failure —
 * a non-OK response, malformed JSON, an offline browser, an abort, or its own
 * {@link TIMEOUT_MS} timeout — so the caller just keeps its default weather. Honours
 * an outer AbortSignal (e.g. the city-load cancel) as well as the internal timeout.
 */
export async function fetchCityWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Weather | null> {
  const url = `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=weather_code`
  const ctrl = new AbortController()
  const relay = (): void => ctrl.abort()
  signal?.addEventListener('abort', relay)
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const data: unknown = await res.json()
    const code = (data as { current?: { weather_code?: unknown } })?.current?.weather_code
    return typeof code === 'number' ? weatherFromCode(code) : null
  } catch {
    return null // offline, aborted, timed out, or garbage — fall back to the default
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}
