import { t } from '../i18n/i18n'
import type { VehicleType } from '../vehicle/vehicles'

export type StartMode = 'free' | 'trial' | 'race' | 'taxi'

export interface StartMenuCallbacks {
  /** Big Play button: start driving with the chosen mode. */
  onPlay: (mode: StartMode) => void
  /** Resume the saved session (only offered when one exists). */
  onContinue: () => void
  /** A city was searched — reload the backdrop to it. */
  onCity: (query: string) => void
  /** 🎲 — reload the backdrop to a fresh random city. */
  onRandom: () => void
  /** A vehicle was picked — swap the backdrop car live. */
  onVehicle: (type: VehicleType) => void
  /** A mode was picked (recorded; applied on Play). */
  onMode: (mode: StartMode) => void
}

export interface StartMenuHandle {
  show(): void
  hide(): void
  /** Offer (or hide) the Continue button. */
  setContinueAvailable(on: boolean): void
  /** Reflect the current backdrop car in the strip. */
  setVehicle(type: VehicleType): void
  /** Put a city name in the search box (e.g. from a ?city= link). */
  setCity(query: string): void
  visible(): boolean
}

/** The handful shown in the strip; the rest are behind "More…". */
const POPULAR: VehicleType[] = ['car', 'sports', 'jeep', 'motorbike', 'bus', 'racecar']

/** Emoji per vehicle (kept in step with settingsMenu's map). Its keys are the full roster. */
const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗', truck: '🚚', sports: '🏎', motorbike: '🏍', bus: '🚌', racecar: '🏁',
  tractor: '🚜', lorry: '🚛', cabrio: '🚙', retro: '🚘', ev: '🔌', minivan: '🚐',
  jeep: '🛻', tanker: '🛢', crane: '🏗', roller: '🛞', combine: '🌾', tiller: '⚙',
  tracked: '⛰', hover: '🛸',
}
const ALL_VEHICLES = Object.keys(VEHICLE_EMOJI) as VehicleType[]

const ACTIVE = '#e63946'
const IDLE = '#26303f'
const MODES: StartMode[] = ['free', 'trial', 'race', 'taxi']

/**
 * The start screen: a branded overlay over a live city driving itself. Pick a
 * city, a car and a mode, then Play (or Continue a saved session). Everything
 * beyond the quick picks stays in the in-game ⚙ menu.
 */
export function createStartMenu(root: HTMLElement, cb: StartMenuCallbacks, initial: {
  vehicle: VehicleType
  city: string
  hasSession: boolean
}): StartMenuHandle {
  let mode: StartMode = 'free'
  let vehicle = initial.vehicle

  const overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;' +
    "font-family:system-ui,sans-serif;background:radial-gradient(120% 120% at 50% 20%,rgba(3,7,18,.15),rgba(3,7,18,.72));"

  const panel = document.createElement('div')
  panel.style.cssText =
    'min-width:320px;max-width:min(92vw,460px);padding:26px 24px 22px;border-radius:16px;' +
    'background:rgba(12,18,30,.82);backdrop-filter:blur(6px);box-shadow:0 18px 60px rgba(0,0,0,.5);' +
    'color:#fff;display:flex;flex-direction:column;gap:14px;'
  overlay.appendChild(panel)

  const title = document.createElement('div')
  title.textContent = 'RACE THE CITY'
  title.style.cssText = 'font-size:30px;font-weight:800;letter-spacing:2px;text-align:center;' +
    'background:linear-gradient(90deg,#38f5ff,#ff5bd0);-webkit-background-clip:text;background-clip:text;color:transparent;'
  const subtitle = document.createElement('div')
  subtitle.style.cssText = 'text-align:center;opacity:.7;font-size:13px;margin-top:-8px;'
  panel.append(title, subtitle)

  // --- city row ---
  const cityRow = document.createElement('div')
  cityRow.style.cssText = 'display:flex;gap:6px;'
  const cityInput = document.createElement('input')
  cityInput.value = initial.city
  cityInput.style.cssText =
    'flex:1;padding:9px 11px;border-radius:8px;border:1px solid #2a3547;background:#0c1220;color:#fff;font-size:14px;'
  const goBtn = mkBtn('')
  goBtn.style.padding = '9px 13px'
  const submitCity = (): void => {
    const q = cityInput.value.trim()
    if (q) cb.onCity(q)
  }
  goBtn.onclick = submitCity
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCity()
    e.stopPropagation() // don't let driving keys fire while typing
  })
  cityRow.append(cityInput, goBtn)

  const randomBtn = mkBtn('')
  randomBtn.style.width = '100%'
  randomBtn.onclick = () => cb.onRandom()

  // --- car strip + full grid ---
  const carLabel = mkLabel('')
  const strip = document.createElement('div')
  strip.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
  const grid = document.createElement('div')
  grid.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;max-height:150px;overflow:auto;'
  const carBtns = new Map<VehicleType, HTMLButtonElement>()

  const pickVehicle = (v: VehicleType): void => {
    vehicle = v
    for (const [type, b] of carBtns) b.style.background = type === v ? ACTIVE : IDLE
    cb.onVehicle(v)
  }
  const carButton = (v: VehicleType, withName: boolean): HTMLButtonElement => {
    const b = mkBtn(withName ? `${VEHICLE_EMOJI[v]} ${t('vehicle.' + v)}` : VEHICLE_EMOJI[v])
    b.onclick = () => pickVehicle(v)
    carBtns.set(v, b)
    return b
  }
  for (const v of POPULAR) strip.appendChild(carButton(v, false))
  const moreBtn = mkBtn('')
  moreBtn.onclick = () => {
    grid.style.display = grid.style.display === 'none' ? 'flex' : 'none'
  }
  strip.appendChild(moreBtn)
  for (const v of ALL_VEHICLES) grid.appendChild(carButton(v, true))

  // --- mode segmented ---
  const modeLabel = mkLabel('')
  const modeRow = document.createElement('div')
  modeRow.style.cssText = 'display:flex;gap:6px;'
  const modeBtns = new Map<StartMode, HTMLButtonElement>()
  const modeText: Record<StartMode, string> = { free: 'start.modeFree', trial: 'start.modeTrial', race: 'start.modeRace', taxi: 'start.modeTaxi' }
  const pickMode = (m: StartMode): void => {
    mode = m
    for (const [k, b] of modeBtns) b.style.background = k === m ? ACTIVE : IDLE
    cb.onMode(m)
  }
  for (const m of MODES) {
    const b = mkBtn('')
    b.style.flex = '1'
    b.dataset.mode = m
    b.onclick = () => pickMode(m)
    modeBtns.set(m, b)
    modeRow.appendChild(b)
  }

  // --- play + continue ---
  const playBtn = mkBtn('')
  playBtn.style.cssText += 'padding:14px;font-size:18px;font-weight:700;background:' + ACTIVE + ';'
  playBtn.onclick = () => cb.onPlay(mode)
  const continueBtn = mkBtn('')
  continueBtn.style.cssText += 'padding:11px;background:#1d6a3a;'
  continueBtn.onclick = () => cb.onContinue()
  continueBtn.style.display = initial.hasSession ? 'block' : 'none'

  panel.append(cityRow, randomBtn, carLabel, strip, grid, modeLabel, modeRow, playBtn, continueBtn)
  root.appendChild(overlay)

  // Fill all text (and re-fill on language change via re-render call sites).
  const applyText = (): void => {
    subtitle.textContent = t('start.subtitle')
    goBtn.textContent = t('input.go')
    cityInput.placeholder = t('input.placeholder')
    randomBtn.textContent = t('start.random')
    carLabel.textContent = t('start.car')
    moreBtn.textContent = t('start.more')
    modeLabel.textContent = t('start.mode')
    for (const [m, b] of modeBtns) b.textContent = t(modeText[m])
    playBtn.textContent = '▶ ' + t('start.play')
    continueBtn.textContent = t('start.continue')
  }
  applyText()
  pickMode('free')
  // Highlight the initial vehicle WITHOUT firing the swap callback — the game
  // already has this car, and the callback runs before the first city loads.
  for (const [type, b] of carBtns) b.style.background = type === vehicle ? ACTIVE : IDLE

  return {
    show() {
      overlay.style.display = 'flex'
      applyText()
    },
    hide() {
      overlay.style.display = 'none'
    },
    setContinueAvailable(on) {
      continueBtn.style.display = on ? 'block' : 'none'
    },
    setVehicle(type) {
      if (type !== vehicle) pickVehicleSilently(type)
      function pickVehicleSilently(v: VehicleType): void {
        vehicle = v
        for (const [k, b] of carBtns) b.style.background = k === v ? ACTIVE : IDLE
      }
    },
    setCity(query) {
      cityInput.value = query
    },
    visible() {
      return overlay.style.display !== 'none'
    },
  }
}

function mkBtn(text: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = text
  b.style.cssText =
    `padding:8px 11px;border:0;border-radius:8px;color:#fff;cursor:pointer;font-size:14px;background:${IDLE};`
  return b
}

function mkLabel(text: string): HTMLDivElement {
  const d = document.createElement('div')
  d.textContent = text
  d.style.cssText = 'font-size:12px;opacity:.65;margin-bottom:-6px;'
  return d
}
