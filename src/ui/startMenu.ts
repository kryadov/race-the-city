import { t, getLang, setLang, LANGS, onLangChange } from '../i18n/i18n'
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
  /** Fade the animated boot backdrop out — a city is on the canvas now. */
  revealCity(): void
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
  // #ui is pointer-events:none so it doesn't eat clicks meant for the canvas;
  // every interactive widget must opt back in, or nothing in it is clickable.
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;pointer-events:auto;' +
    "font-family:system-ui,sans-serif;background:radial-gradient(120% 120% at 50% 20%,rgba(3,7,18,.15),rgba(3,7,18,.72));"

  const panel = document.createElement('div')
  panel.style.cssText =
    'min-width:320px;max-width:min(92vw,460px);padding:26px 24px 22px;border-radius:16px;' +
    'background:rgba(12,18,30,.82);backdrop-filter:blur(6px);box-shadow:0 18px 60px rgba(0,0,0,.5);' +
    'color:#fff;display:flex;flex-direction:column;gap:14px;'
  // A synthwave floor and sun animate behind the panel while the first city
  // loads, so the boot screen isn't a dead black void. It fades out (revealCity)
  // the moment a city is on the canvas, letting the live demo show through.
  const backdrop = buildLoadingBackdrop()
  overlay.appendChild(backdrop)
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

  // Language toggle — EN / RU right on the front screen.
  const langRow = document.createElement('div')
  langRow.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-top:2px'
  const langBtns = new Map<string, HTMLButtonElement>()
  const highlightLang = (): void => {
    for (const [l, b] of langBtns) b.style.background = l === getLang() ? ACTIVE : IDLE
  }
  for (const lang of LANGS) {
    const lb = mkBtn(lang.toUpperCase())
    lb.style.flex = '1'
    lb.onclick = () => {
      setLang(lang)
      highlightLang()
    }
    langBtns.set(lang, lb)
    langRow.appendChild(lb)
  }

  panel.append(cityRow, randomBtn, carLabel, strip, grid, modeLabel, modeRow, playBtn, continueBtn, langRow)
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
  highlightLang()
  onLangChange(() => {
    applyText()
    highlightLang()
  })
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
    revealCity() {
      if (backdrop.style.opacity === '0') return
      backdrop.style.opacity = '0'
      // Stop the floor/sun animating once it's invisible behind the live city.
      setTimeout(() => {
        backdrop.style.display = 'none'
      }, 900)
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

/**
 * The animated boot backdrop: a synthwave sunset — gradient sky, a glowing sun on
 * the horizon and a perspective grid scrolling toward you — drawn behind the menu
 * panel so the first city's load isn't a black void. Pure CSS plus the same WAAPI
 * the loading spinner uses (no stylesheet to inject); `revealCity()` fades it out.
 */
function buildLoadingBackdrop(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'position:absolute;inset:0;overflow:hidden;pointer-events:none;transition:opacity .8s ease;' +
    'background:linear-gradient(to bottom,#0a0618 0%,#241a52 34%,#6a2a7a 54%,#ff5bd0 65%,#ff8a4d 69%,#160726 70%,#0a0414 100%);'

  const sun = document.createElement('div')
  sun.style.cssText =
    'position:absolute;left:50%;top:60%;width:200px;height:200px;transform:translate(-50%,-50%);' +
    'border-radius:50%;filter:blur(1px);' +
    'background:radial-gradient(circle at 50% 42%,#fef3b0,#ff9a3d 42%,#ff4fa3 74%,rgba(255,79,163,0) 100%);'

  const grid = document.createElement('div')
  grid.style.cssText =
    'position:absolute;left:-30%;right:-30%;top:66%;bottom:-2%;transform:perspective(300px) rotateX(76deg);transform-origin:top center;' +
    '-webkit-mask-image:linear-gradient(to bottom,transparent,#000 34%);mask-image:linear-gradient(to bottom,transparent,#000 34%);' +
    'background-image:repeating-linear-gradient(to right,rgba(56,245,255,.5) 0 2px,transparent 2px 66px),' +
    'repeating-linear-gradient(to bottom,rgba(56,245,255,.5) 0 2px,transparent 2px 66px);'

  wrap.append(sun, grid)
  // The floor rolls toward the viewer, and the sun breathes — WAAPI, so nothing
  // has to be injected into a stylesheet.
  grid.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: '0 66px' }], { duration: 1600, iterations: Infinity })
  sun.animate(
    [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.05)' }],
    { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
  )
  return wrap
}
