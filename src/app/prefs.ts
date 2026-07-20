import type { WeatherSetting } from './weather'
import type { Quality } from './scene'
import type { Units } from '../ui/hud'
import type { TimeMode } from './daynight'

const UNITS_KEY = 'rtc.units'

/** Persisted display units ('km' by default). */
export function getUnits(): Units {
  try {
    const u = localStorage.getItem(UNITS_KEY)
    if (u === 'km' || u === 'mi') return u
  } catch {
    /* ignore */
  }
  return 'km'
}

export function setUnits(u: Units): void {
  try {
    localStorage.setItem(UNITS_KEY, u)
  } catch {
    /* ignore */
  }
}

const QUALITY_KEY = 'rtc.quality'

/** Persisted render-quality tier ('normal' by default). */
export function getQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY)
    if (q === 'low' || q === 'normal' || q === 'high') return q
  } catch {
    /* ignore */
  }
  return 'normal'
}

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q)
  } catch {
    /* ignore */
  }
}

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

const SESSION_KEY = 'rtc.session'

export interface Session {
  city: string
  x: number
  z: number
  heading: number
  /** Total distance driven, in metres. */
  dist?: number
}

/** The last city + car pose, so a reload resumes where the player left off. */
export function getSession(): Session | null {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    if (!s) return null
    const o = JSON.parse(s) as Session
    if (typeof o.city === 'string' && Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.heading)) return o
  } catch {
    /* ignore */
  }
  return null
}

export function setSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** Forget the resume point (leaves every other setting alone). */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

const DENSITY_KEY = 'rtc.density'

/** How busy the streets are. */
export function getDensity(): import('./density').Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    if (v === 'low' || v === 'high') return v
  } catch {
    /* ignore */
  }
  return 'normal'
}

export function setDensity(d: import('./density').Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, d)
  } catch {
    /* ignore */
  }
}

const TRIAL_KEY = 'rtc.trial'

/** Whether the time trial is running (off by default). */
export function getTrial(): boolean {
  try {
    return localStorage.getItem(TRIAL_KEY) === '1'
  } catch {
    return false
  }
}

export function setTrial(on: boolean): void {
  try {
    localStorage.setItem(TRIAL_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const RACE_KEY = 'rtc.race'

/** Whether AI rivals race the player round the trial gates (off by default). */
export function getRace(): boolean {
  try {
    return localStorage.getItem(RACE_KEY) === '1'
  } catch {
    return false
  }
}

export function setRace(on: boolean): void {
  try {
    localStorage.setItem(RACE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const DEMO_KEY = 'rtc.demo'

/** Whether the car drives itself (off by default — it's a demo, not the game). */
export function getDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemo(on: boolean): void {
  try {
    localStorage.setItem(DEMO_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const NITRO_KEY = 'rtc.nitro'

/** Whether nitro speed-boost pickups appear (on by default). */
export function getNitro(): boolean {
  try {
    return localStorage.getItem(NITRO_KEY) !== '0'
  } catch {
    return true
  }
}

export function setNitro(on: boolean): void {
  try {
    localStorage.setItem(NITRO_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const ARCADE_KEY = 'rtc.arcade'

/** Whether arcade "find a car" mode is on (off by default). */
export function getArcade(): boolean {
  try {
    return localStorage.getItem(ARCADE_KEY) === '1'
  } catch {
    return false
  }
}

export function setArcade(on: boolean): void {
  try {
    localStorage.setItem(ARCADE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const FUEL_KEY = 'rtc.fuel'

/** Whether the fuel tank drains as you drive (on by default; off = never runs dry). */
export function getFuelUse(): boolean {
  try {
    return localStorage.getItem(FUEL_KEY) !== '0'
  } catch {
    return true
  }
}

export function setFuelUse(on: boolean): void {
  try {
    localStorage.setItem(FUEL_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const ZOOM_KEY = 'rtc.zoom'

/** Persisted camera zoom (camDist multiplier; 1 = default). */
export function getZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    if (Number.isFinite(v) && v > 0) return v
  } catch {
    /* ignore */
  }
  return 1
}

export function setZoom(v: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(v))
  } catch {
    /* ignore */
  }
}

const FUEL_RATE_KEY = 'rtc.fuelRate'

/** Persisted fuel burn-rate multiplier (1 = default); scales the per-vehicle thirst. */
export function getFuelRate(): number {
  try {
    const v = Number(localStorage.getItem(FUEL_RATE_KEY))
    if (Number.isFinite(v) && v > 0) return v
  } catch {
    /* ignore */
  }
  return 1
}

export function setFuelRate(v: number): void {
  try {
    localStorage.setItem(FUEL_RATE_KEY, String(v))
  } catch {
    /* ignore */
  }
}

const MINIMAP_ZOOM_KEY = 'rtc.minimapZoom'
const DEFAULT_MINIMAP_ZOOM = 2 // middle step — the 260 m view the minimap shipped with

/** Persisted minimap zoom level (index into the minimap's discrete steps). */
export function getMinimapZoom(): number {
  try {
    const raw = localStorage.getItem(MINIMAP_ZOOM_KEY)
    if (raw !== null) {
      const v = Number(raw)
      if (Number.isInteger(v) && v >= 0) return v
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_MINIMAP_ZOOM
}

export function setMinimapZoom(i: number): void {
  try {
    localStorage.setItem(MINIMAP_ZOOM_KEY, String(i))
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

/** Persisted weather setting ('auto' by default — cycles through the weathers). */
export function getWeather(): WeatherSetting {
  try {
    const w = localStorage.getItem(WEATHER_KEY)
    if (w === 'clear' || w === 'rain' || w === 'snow' || w === 'fog' || w === 'auto') return w
  } catch {
    /* ignore */
  }
  return 'auto'
}

export function setWeather(w: WeatherSetting): void {
  try {
    localStorage.setItem(WEATHER_KEY, w)
  } catch {
    /* ignore */
  }
}

const TIME_MODE_KEY = 'rtc.timeMode'

/** Persisted clock mode ('cycle' by default — the full day/night loop runs). */
export function getTimeMode(): TimeMode {
  try {
    const m = localStorage.getItem(TIME_MODE_KEY)
    if (m === 'cycle' || m === 'day' || m === 'night') return m
  } catch {
    /* ignore */
  }
  return 'cycle'
}

export function setTimeMode(m: TimeMode): void {
  try {
    localStorage.setItem(TIME_MODE_KEY, m)
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
