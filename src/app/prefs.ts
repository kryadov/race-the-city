import type { Weather } from './weather'

const DEFAULT_CITY_KEY = 'rtc.defaultCity'
const FALLBACK_CITY = 'Monte Carlo'

/** The startup city: the saved default, or the built-in fallback. */
export function getDefaultCity(): string {
  try {
    return localStorage.getItem(DEFAULT_CITY_KEY) || FALLBACK_CITY
  } catch {
    return FALLBACK_CITY
  }
}

export function setDefaultCity(city: string): void {
  try {
    localStorage.setItem(DEFAULT_CITY_KEY, city)
  } catch {
    /* ignore persistence failures */
  }
}

const ROAD_LABELS_KEY = 'rtc.roadLabels'

/** Whether street-name labels are shown (off by default). */
export function getRoadLabels(): boolean {
  try {
    return localStorage.getItem(ROAD_LABELS_KEY) === '1'
  } catch {
    return false
  }
}

export function setRoadLabels(on: boolean): void {
  try {
    localStorage.setItem(ROAD_LABELS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const DRIFT_FX_KEY = 'rtc.driftFx'

/** Whether skid marks + drift smoke are shown (on by default). */
export function getDriftFx(): boolean {
  try {
    return localStorage.getItem(DRIFT_FX_KEY) !== '0'
  } catch {
    return true
  }
}

export function setDriftFx(on: boolean): void {
  try {
    localStorage.setItem(DRIFT_FX_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const HUD_KEY = 'rtc.hud'

/** Whether the HUD (city + speed) is shown (on by default). */
export function getHud(): boolean {
  try {
    return localStorage.getItem(HUD_KEY) !== '0'
  } catch {
    return true
  }
}

export function setHud(on: boolean): void {
  try {
    localStorage.setItem(HUD_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const SHADOWS_KEY = 'rtc.shadows'

/** Whether shadows are rendered (on by default). */
export function getShadows(): boolean {
  try {
    return localStorage.getItem(SHADOWS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setShadows(on: boolean): void {
  try {
    localStorage.setItem(SHADOWS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const CLOUDS_KEY = 'rtc.clouds'

/** Whether clouds are shown (on by default). */
export function getClouds(): boolean {
  try {
    return localStorage.getItem(CLOUDS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setClouds(on: boolean): void {
  try {
    localStorage.setItem(CLOUDS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const ROAD_DETAIL_KEY = 'rtc.roadDetail'

/** Whether road dressing (lamps, signs, lane lines) is shown (on by default). */
export function getRoadDetail(): boolean {
  try {
    return localStorage.getItem(ROAD_DETAIL_KEY) !== '0'
  } catch {
    return true
  }
}

export function setRoadDetail(on: boolean): void {
  try {
    localStorage.setItem(ROAD_DETAIL_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const WEATHER_KEY = 'rtc.weather'

/** Persisted weather (clear by default). */
export function getWeather(): Weather {
  try {
    const w = localStorage.getItem(WEATHER_KEY)
    if (w === 'clear' || w === 'rain' || w === 'snow' || w === 'fog') return w
  } catch {
    /* ignore */
  }
  return 'clear'
}

export function setWeather(w: Weather): void {
  try {
    localStorage.setItem(WEATHER_KEY, w)
  } catch {
    /* ignore */
  }
}

/** Clear every persisted setting (rtc.* keys). */
export function resetSettings(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('rtc.')) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
