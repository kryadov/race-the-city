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
