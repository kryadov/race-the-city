import { t, getLang, setLang, onLangChange, LANGS } from '../i18n/i18n'
import type { VehicleType } from '../vehicle/vehicles'
import type { ViewMode } from '../app/theme'
import { type AudioState, TRACK_NAMES } from '../audio/audio'
import { WEATHER_SETTINGS, type WeatherSetting } from '../app/weather'
import { TIME_MODES, type TimeMode } from '../app/daynight'
import { QUALITIES, type Quality } from '../app/scene'
import { DENSITIES, type Density } from '../app/density'
import { UNITS, type Units } from './hud'

/**
 * The one game mode, single-select. Merges the splash's `StartMode` and the old
 * side-menu's independent arcade/trial/race toggles into a single source of
 * truth: exactly one is ever active. `arcade` is the "find-a-car" pickup mode.
 */
export type Mode = 'free' | 'trial' | 'race' | 'taxi' | 'arcade'

const MODES: Mode[] = ['free', 'trial', 'race', 'taxi', 'arcade']
// Each mode's main-screen label. Reuses existing i18n keys — `arcade` has no
// short key of its own, so it shows a joystick with a tooltip (see paintText).
const MODE_KEY: Record<Mode, string> = {
  free: 'start.modeFree',
  trial: 'start.modeTrial',
  race: 'start.modeRace',
  taxi: 'start.modeTaxi',
  arcade: 'menu.arcade',
}

export interface MenuCallbacks {
  /** Big Play button: start driving with the chosen mode (→ Resume/Apply in-session). */
  onPlay: (mode: Mode) => void
  /** Resume the saved session (only offered when one exists and none is live). */
  onContinue: () => void
  /** A city was searched — play it (start) or load it live (in-session). */
  onCity: (query: string) => void
  /** 🎲 — a fresh random city. */
  onRandom: () => void
  /** A vehicle was picked — swap the car live. */
  onVehicle: (type: VehicleType) => void
  /** A mode was picked: recorded at start, applied live in-session. */
  onMode: (mode: Mode) => void
  // --- Options screen (everything the old side menu held, minus city/vehicle/modes) ---
  onSetDefaultCity: (query: string) => void
  onShareCity: () => void
  onSetView: (mode: ViewMode) => void
  onAudioChange: (patch: Partial<AudioState>) => void
  /** A user-picked audio file to loop as music, or null to restore the built-in loop. */
  onCustomMusic: (file: File | null) => void
  onRoadLabels: (on: boolean) => void
  onSetTime: (t: number) => void
  onDriftFx: (on: boolean) => void
  onHud: (on: boolean) => void
  onShadows: (on: boolean) => void
  onClouds: (on: boolean) => void
  onRoadDetail: (on: boolean) => void
  onNitro: (on: boolean) => void
  onFuel: (on: boolean) => void
  /** Fuel burn-rate multiplier (only fired when fuel use is on). */
  onFuelRate: (v: number) => void
  /** Autopilot: a "watch it drive" toggle, not a play mode — lives in Options. */
  onDemo: (on: boolean) => void
  onQuality: (q: Quality) => void
  onDensity: (d: Density) => void
  onUnits: (u: Units) => void
  onWeather: (w: WeatherSetting) => void
  onTimeMode: (m: TimeMode) => void
  onZoom: (v: number) => void
  /** Forget the saved position/city and go back to the default start. */
  onResetLocation: () => void
  onReset: () => void
}

export interface MenuInit {
  city: string
  vehicle: VehicleType
  hasSession: boolean
  view: ViewMode
  audio: AudioState
  roadLabels: boolean
  time: number
  driftFx: boolean
  hud: boolean
  shadows: boolean
  clouds: boolean
  roadDetail: boolean
  nitro: boolean
  fuel: boolean
  fuelRate: number
  demo: boolean
  quality: Quality
  density: Density
  units: Units
  weather: WeatherSetting
  timeMode: TimeMode
  zoom: number
}

export interface MenuHandle {
  /** Bring the menu up (over the attract city at start, or the paused game in-session). */
  open(): void
  /** Dismiss the menu. */
  close(): void
  /** Wired to Esc. */
  toggle(): void
  visible(): boolean
  /** A session is live: PLAY→Resume, and Continue (resume-saved) is redundant. */
  setSessionLive(on: boolean): void
  setVehicle(type: VehicleType): void
  setCity(query: string): void
  setMode(mode: Mode): void
  setViewMode(mode: ViewMode): void
  setTime(t: number): void
  setZoom(v: number): void
  /** Fade the animated boot backdrop out — a city is on the canvas now. */
  revealCity(): void
  /** Drop the menu controls but keep the animated backdrop up as a loading screen. */
  enterLoading(): void
}

/** The handful shown in the main strip; the rest are behind "More…". */
const POPULAR: VehicleType[] = ['car', 'sports', 'jeep', 'motorbike', 'bus', 'racecar']

/** Emoji per vehicle. Its keys are the full roster (drives the "all cars" grid). */
const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗', truck: '🚚', sports: '🏎', motorbike: '🏍', bus: '🚌', racecar: '🏁',
  tractor: '🚜', lorry: '🚛', cabrio: '🚙', retro: '🚘', ev: '🔌', minivan: '🚐',
  jeep: '🛻', pickup: '🛻', police: '🚓', tanker: '🛢', ambulance: '🚑', firetruck: '🚒',
  crane: '🏗', roller: '🛞', combine: '🌾', tiller: '⚙',
  tracked: '⛰', hover: '🛸',
}
const ALL_VEHICLES = Object.keys(VEHICLE_EMOJI) as VehicleType[]

const QUALITY_EMOJI: Record<Quality, string> = { low: '🐢', normal: '⚖', high: '✨' }
const WEATHER_EMOJI: Record<WeatherSetting, string> = { auto: '🔄', clear: '☀', rain: '🌧', snow: '❄', fog: '🌫' }
const TIME_EMOJI: Record<TimeMode, string> = { cycle: '🔄', day: '☀', night: '🌙' }

// One palette for both screens — the splash and the old side menu already shared it.
const ACTIVE = '#e63946'
const IDLE = '#26303f'

/**
 * The one central menu. A branded splash over a live city (attract at start, the
 * paused game in-session), with two screens:
 *  - MAIN: city search, vehicle strip, a single-select mode picker, Play/Continue,
 *    a language quick-toggle and a ⚙ Options button.
 *  - OPTIONS: every setting the old side menu held (view, audio, map & density,
 *    location, language, about, autopilot) behind a ← Back.
 * It opens at start and on Esc; only PLAY→Resume and Continue's presence differ.
 */
export function createMenu(root: HTMLElement, cb: MenuCallbacks, initial: MenuInit): MenuHandle {
  let mode: Mode = 'free'
  let vehicle = initial.vehicle
  let live = false // a driving session is in progress (set via setSessionLive)
  const hasSession = initial.hasSession

  // Options-screen mutable state, mirroring the values the old side menu held.
  let view = initial.view
  let audio = initial.audio
  let roadLabels = initial.roadLabels
  let driftFx = initial.driftFx
  let hud = initial.hud
  let shadows = initial.shadows
  let clouds = initial.clouds
  let roadDetail = initial.roadDetail
  let nitro = initial.nitro
  // Fuel is one cycling button: off, then three burn rates. Step 0 is off; 1..3 are the rates.
  const FUEL_RATES = [1, 0.5, 1, 1.6]
  const fuelStepOf = (on: boolean, rate: number): number => (!on ? 0 : rate <= 0.7 ? 1 : rate >= 1.4 ? 3 : 2)
  let fuelStep = fuelStepOf(initial.fuel, initial.fuelRate)
  let demo = initial.demo
  let quality = initial.quality
  let density = initial.density
  let units = initial.units
  let weather = initial.weather
  let timeMode = initial.timeMode

  const overlay = document.createElement('div')
  // #ui is pointer-events:none so it doesn't eat clicks meant for the canvas;
  // every interactive widget must opt back in, or nothing in it is clickable.
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;pointer-events:auto;' +
    "font-family:system-ui,sans-serif;background:radial-gradient(120% 120% at 50% 20%,rgba(3,7,18,.15),rgba(3,7,18,.72));"

  // A synthwave floor and sun animate behind the panel while the first city loads,
  // so the boot screen isn't a dead black void. It fades out (revealCity) the
  // moment a city is on the canvas, letting the live demo (or paused game) show.
  const backdrop = buildLoadingBackdrop()
  overlay.appendChild(backdrop)

  const panel = document.createElement('div')
  panel.style.cssText =
    'min-width:320px;max-width:min(92vw,460px);padding:22px 22px 18px;border-radius:16px;' +
    'background:rgba(12,18,30,.82);backdrop-filter:blur(6px);box-shadow:0 18px 60px rgba(0,0,0,.5);color:#fff;'
  overlay.appendChild(panel)

  // The two screens live inside the one card; only one is ever displayed.
  const mainScreen = document.createElement('div')
  mainScreen.dataset.screen = 'main'
  mainScreen.style.cssText = 'display:flex;flex-direction:column;gap:14px;'
  const optionsScreen = document.createElement('div')
  optionsScreen.dataset.screen = 'options'
  optionsScreen.style.cssText = 'display:none;flex-direction:column;gap:2px;max-height:calc(100vh - 150px);overflow-y:auto;'
  panel.append(mainScreen, optionsScreen)

  // Text that changes with the language is filled in paintText(); labels[] collects
  // the Options-screen elements that just show a translated key.
  const labels: Array<{ el: HTMLElement; key: string }> = []

  // ======================================================================== //
  //  MAIN screen
  // ======================================================================== //
  const title = document.createElement('div')
  title.dataset.role = 'title'
  title.style.cssText = 'font-size:30px;font-weight:800;letter-spacing:2px;text-align:center;' +
    'background:linear-gradient(90deg,#38f5ff,#ff5bd0);-webkit-background-clip:text;background-clip:text;color:transparent;'
  const subtitle = document.createElement('div')
  subtitle.style.cssText = 'text-align:center;opacity:.7;font-size:13px;margin-top:-8px;'
  mainScreen.append(title, subtitle)

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
  goBtn.addEventListener('click', submitCity)
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCity()
    e.stopPropagation() // don't let driving keys fire while typing
  })
  cityRow.append(cityInput, goBtn)

  const randomBtn = mkBtn('')
  randomBtn.style.width = '100%'
  randomBtn.addEventListener('click', () => cb.onRandom())

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
    b.addEventListener('click', () => pickVehicle(v))
    carBtns.set(v, b)
    return b
  }
  for (const v of POPULAR) strip.appendChild(carButton(v, false))
  const moreBtn = mkBtn('')
  moreBtn.addEventListener('click', () => {
    grid.style.display = grid.style.display === 'none' ? 'flex' : 'none'
  })
  strip.appendChild(moreBtn)
  for (const v of ALL_VEHICLES) grid.appendChild(carButton(v, true))

  // --- mode segmented (single-select) ---
  const modeLabel = mkLabel('')
  const modeRow = document.createElement('div')
  modeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
  const modeBtns = new Map<Mode, HTMLButtonElement>()
  const pickMode = (m: Mode, fire = true): void => {
    mode = m
    for (const [k, b] of modeBtns) b.style.background = k === m ? ACTIVE : IDLE
    if (fire) cb.onMode(m)
  }
  for (const m of MODES) {
    const b = mkBtn('')
    b.style.flex = '1'
    b.dataset.mode = m
    b.addEventListener('click', () => pickMode(m))
    modeBtns.set(m, b)
    modeRow.appendChild(b)
  }

  // --- play + continue + options ---
  const playBtn = mkBtn('')
  playBtn.dataset.role = 'play'
  playBtn.style.cssText += 'padding:14px;font-size:18px;font-weight:700;background:' + ACTIVE + ';'
  playBtn.addEventListener('click', () => cb.onPlay(mode))
  const continueBtn = mkBtn('')
  continueBtn.dataset.role = 'continue'
  continueBtn.style.cssText += 'padding:11px;background:#1d6a3a;'
  continueBtn.addEventListener('click', () => cb.onContinue())

  // Language quick-toggle — EN / RU right on the front screen.
  const langRow = document.createElement('div')
  langRow.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-top:2px'
  const langBtns = new Map<string, HTMLButtonElement>()
  for (const lang of LANGS) {
    const lb = mkBtn(lang.toUpperCase())
    lb.dataset.lang = lang
    lb.style.flex = '1'
    lb.addEventListener('click', () => setLang(lang))
    langBtns.set(lang, lb)
    langRow.appendChild(lb)
  }

  const optionsBtn = mkBtn('')
  optionsBtn.dataset.role = 'options'
  optionsBtn.style.cssText += 'background:#1c2636;'
  optionsBtn.addEventListener('click', () => showOptions())

  mainScreen.append(cityRow, randomBtn, carLabel, strip, grid, modeLabel, modeRow, playBtn, continueBtn, optionsBtn, langRow)

  // ======================================================================== //
  //  OPTIONS screen
  // ======================================================================== //
  const backRow = document.createElement('div')
  backRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;'
  const backBtn = mkBtn('←')
  backBtn.dataset.role = 'back'
  backBtn.addEventListener('click', () => showMain())
  const optionsTitle = document.createElement('div')
  optionsTitle.style.cssText = 'font-size:15px;font-weight:700;opacity:.85'
  labels.push({ el: optionsTitle, key: 'menu.title' })
  backRow.append(backBtn, optionsTitle)
  optionsScreen.appendChild(backRow)

  // Which groups are expanded, remembered across sessions (carried over from the
  // old side menu's key so a returning player's layout survives).
  const OPEN_KEY = 'rtc.menuOpen'
  const openState: Record<string, boolean> = (() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })()
  const saveOpen = (): void => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(openState))
    } catch {
      /* ignore */
    }
  }
  /** A collapsible group, appended in creation order; returns the body to fill. */
  function section(key: string, parent: HTMLElement = optionsScreen): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.07)'
    const header = document.createElement('button')
    header.style.cssText =
      'width:100%;display:flex;justify-content:space-between;align-items:center;background:none;' +
      'border:0;color:#fff;opacity:.75;font-size:12px;cursor:pointer;padding:8px 0;text-align:left'
    const lbl = document.createElement('span')
    const chev = document.createElement('span')
    header.append(lbl, chev)
    const body = document.createElement('div')
    body.style.cssText = 'padding:2px 0 10px'
    labels.push({ el: lbl, key })

    let open = openState[key] ?? key === 'menu.city'
    const apply = (): void => {
      body.style.display = open ? 'block' : 'none'
      chev.textContent = open ? '▾' : '▸'
    }
    header.addEventListener('click', () => {
      open = !open
      openState[key] = open
      saveOpen()
      apply()
    })
    apply()
    wrap.append(header, body)
    parent.appendChild(wrap)
    return body
  }
  const row = (): HTMLDivElement => {
    const r = document.createElement('div')
    r.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'
    return r
  }

  // --- Language ---
  const langSec = section('menu.language')
  const langRow2 = row()
  const langButtons = new Map<string, HTMLButtonElement>()
  for (const l of LANGS) {
    const b = button()
    b.textContent = l.toUpperCase()
    b.addEventListener('click', () => setLang(l))
    langButtons.set(l, b)
    langRow2.appendChild(b)
  }
  langSec.appendChild(langRow2)

  // --- View ---
  const viewSec = section('menu.view')
  const viewRow = row()
  const dayBtn = button()
  const neonBtn = button()
  dayBtn.addEventListener('click', () => cb.onSetView('day'))
  neonBtn.addEventListener('click', () => cb.onSetView('neon'))
  viewRow.append(dayBtn, neonBtn)
  viewSec.appendChild(viewRow)

  // --- Audio ---
  const audioSec = section('menu.audio')
  const audioRow = (vol: number, ttl: string): { r: HTMLDivElement; btn: HTMLButtonElement; slider: HTMLInputElement } => {
    const r = row()
    r.style.alignItems = 'center'
    const btn = button()
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '1'
    slider.step = '0.05'
    slider.value = String(vol)
    slider.style.cssText = 'flex:1'
    slider.title = ttl
    r.append(btn, slider)
    return { r, btn, slider }
  }
  const sound = audioRow(audio.soundVol, t('menu.sound'))
  const music = audioRow(audio.musicVol, t('menu.music'))
  sound.btn.addEventListener('click', () => {
    audio = { ...audio, sound: !audio.sound }
    cb.onAudioChange({ sound: audio.sound })
    paintAudio()
  })
  sound.slider.addEventListener('input', () => cb.onAudioChange({ soundVol: Number(sound.slider.value) }))
  music.btn.addEventListener('click', () => {
    audio = { ...audio, music: !audio.music }
    cb.onAudioChange({ music: audio.music })
    paintAudio()
  })
  music.slider.addEventListener('input', () => cb.onAudioChange({ musicVol: Number(music.slider.value) }))
  const melodyBtn = button()
  melodyBtn.style.cssText += ';width:100%;margin-top:2px'
  melodyBtn.addEventListener('click', () => {
    const next = (audio.track + 1) % TRACK_NAMES.length
    audio = { ...audio, track: next }
    cb.onAudioChange({ track: next })
    paintMelody()
  })
  // Own-track picker: loops a local audio file in place of the procedural music.
  let customName: string | null = null
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'audio/*'
  fileInput.style.display = 'none'
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (!f) return
    customName = f.name
    cb.onCustomMusic(f)
    fileInput.value = '' // allow re-picking the same file
    paintMelody()
  })
  const customBtn = button()
  customBtn.style.cssText += ';width:100%;margin-top:4px'
  customBtn.addEventListener('click', () => {
    if (customName) {
      customName = null // clear → back to the built-in loop
      cb.onCustomMusic(null)
      paintMelody()
    } else {
      fileInput.click()
    }
  })
  audioSec.append(sound.r, music.r, melodyBtn, customBtn, fileInput)
  function paintAudio(): void {
    sound.btn.textContent = audio.sound ? '🔊' : '🔇'
    music.btn.textContent = audio.music ? '🎵' : '🔕'
  }
  function paintMelody(): void {
    melodyBtn.textContent = customName ? `🎧 ${customName}` : `🎶 ${TRACK_NAMES[audio.track]}`
    melodyBtn.disabled = customName !== null
    melodyBtn.style.opacity = customName ? '0.5' : '1'
    customBtn.textContent = customName ? '✕ ' + t('menu.builtinTrack') : '📂 ' + t('menu.customTrack')
  }

  // --- Map / labels & density ---
  const mapSec = section('menu.map')
  // A checkbox-style toggle button that lives on its own line.
  const toggleBtn = (): HTMLButtonElement => {
    const b = button()
    b.style.cssText += ';width:100%;margin-top:4px'
    return b
  }
  const labelsBtn = button()
  labelsBtn.style.cssText += ';width:100%'
  labelsBtn.addEventListener('click', () => {
    roadLabels = !roadLabels
    cb.onRoadLabels(roadLabels)
    paintToggles()
  })
  mapSec.appendChild(labelsBtn)
  const driftBtn = toggleBtn()
  driftBtn.addEventListener('click', () => {
    driftFx = !driftFx
    cb.onDriftFx(driftFx)
    paintToggles()
  })
  mapSec.appendChild(driftBtn)
  const hudBtn = toggleBtn()
  hudBtn.addEventListener('click', () => {
    hud = !hud
    cb.onHud(hud)
    paintToggles()
  })
  mapSec.appendChild(hudBtn)
  const shadowsBtn = toggleBtn()
  shadowsBtn.addEventListener('click', () => {
    shadows = !shadows
    cb.onShadows(shadows)
    paintToggles()
  })
  mapSec.appendChild(shadowsBtn)
  const cloudsBtn = toggleBtn()
  cloudsBtn.addEventListener('click', () => {
    clouds = !clouds
    cb.onClouds(clouds)
    paintToggles()
  })
  mapSec.appendChild(cloudsBtn)
  const roadDetailBtn = toggleBtn()
  roadDetailBtn.addEventListener('click', () => {
    roadDetail = !roadDetail
    cb.onRoadDetail(roadDetail)
    paintToggles()
  })
  mapSec.appendChild(roadDetailBtn)
  const nitroBtn = toggleBtn()
  nitroBtn.addEventListener('click', () => {
    nitro = !nitro
    cb.onNitro(nitro)
    paintToggles()
  })
  mapSec.appendChild(nitroBtn)
  const fuelBtn = toggleBtn()
  fuelBtn.addEventListener('click', () => {
    fuelStep = (fuelStep + 1) % FUEL_RATES.length // off → eco → normal → thirsty → off
    cb.onFuel(fuelStep > 0)
    if (fuelStep > 0) cb.onFuelRate(FUEL_RATES[fuelStep])
    paintToggles()
  })
  mapSec.appendChild(fuelBtn)
  // Autopilot — a "watch it drive" toggle, orthogonal to the play mode.
  const demoBtn = toggleBtn()
  demoBtn.addEventListener('click', () => {
    demo = !demo
    cb.onDemo(demo)
    paintToggles()
  })
  mapSec.appendChild(demoBtn)
  function paintToggles(): void {
    labelsBtn.textContent = `${roadLabels ? '☑' : '☐'} ${t('menu.roadLabels')}`
    driftBtn.textContent = `${driftFx ? '☑' : '☐'} ${t('menu.driftFx')}`
    hudBtn.textContent = `${hud ? '☑' : '☐'} ${t('menu.hud')}`
    shadowsBtn.textContent = `${shadows ? '☑' : '☐'} ${t('menu.shadows')}`
    cloudsBtn.textContent = `${clouds ? '☑' : '☐'} ${t('menu.clouds')}`
    roadDetailBtn.textContent = `${roadDetail ? '☑' : '☐'} ${t('menu.roadDetail')}`
    nitroBtn.textContent = `${nitro ? '☑' : '☐'} ${t('menu.nitro')}`
    fuelBtn.textContent = `${fuelStep > 0 ? '☑' : '☐'} ${t('menu.fuel')}${fuelStep > 0 ? ' ×' + FUEL_RATES[fuelStep] : ''}`
    demoBtn.textContent = `${demo ? '☑' : '☐'} ${t('menu.demo')}`
  }
  // How busy the world is: cars, people, trains, boats and aircraft together.
  const densityLbl = document.createElement('div')
  densityLbl.style.cssText = 'font-size:12px;opacity:.7;margin:8px 0 4px'
  labels.push({ el: densityLbl, key: 'menu.density' })
  mapSec.appendChild(densityLbl)
  const densityRow = row()
  const densityBtns = new Map<Density, HTMLButtonElement>()
  for (const d of DENSITIES) {
    const b = button()
    b.style.cssText += ';flex:1'
    b.addEventListener('click', () => {
      density = d
      cb.onDensity(d)
      paintStates()
    })
    densityBtns.set(d, b)
    densityRow.appendChild(b)
  }
  mapSec.appendChild(densityRow)

  const weatherBtn = toggleBtn()
  weatherBtn.addEventListener('click', () => {
    weather = WEATHER_SETTINGS[(WEATHER_SETTINGS.indexOf(weather) + 1) % WEATHER_SETTINGS.length]
    cb.onWeather(weather)
    paintWeather()
  })
  mapSec.appendChild(weatherBtn)
  function paintWeather(): void {
    weatherBtn.textContent = `${WEATHER_EMOJI[weather]} ${t('weather.' + weather)}`
  }
  // Time of day: cycle the full loop, or lock to permanent day / night.
  const timeModeBtn = toggleBtn()
  timeModeBtn.addEventListener('click', () => {
    timeMode = TIME_MODES[(TIME_MODES.indexOf(timeMode) + 1) % TIME_MODES.length]
    cb.onTimeMode(timeMode)
    paintTimeMode()
  })
  mapSec.appendChild(timeModeBtn)
  function paintTimeMode(): void {
    timeModeBtn.textContent = `${TIME_EMOJI[timeMode]} ${t('time.' + timeMode)}`
  }
  // Render quality: cycles low → normal → high (resolution scale, shadows, particles).
  const qualityBtn = toggleBtn()
  qualityBtn.addEventListener('click', () => {
    quality = QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]
    cb.onQuality(quality)
    paintQuality()
  })
  mapSec.appendChild(qualityBtn)
  function paintQuality(): void {
    qualityBtn.textContent = `${QUALITY_EMOJI[quality]} ${t('menu.quality')}: ${t('quality.' + quality)}`
  }
  // Display units: km/h + km, or mph + miles.
  const unitsBtn = toggleBtn()
  unitsBtn.addEventListener('click', () => {
    units = UNITS[(UNITS.indexOf(units) + 1) % UNITS.length]
    cb.onUnits(units)
    paintUnits()
  })
  mapSec.appendChild(unitsBtn)
  function paintUnits(): void {
    unitsBtn.textContent = `📏 ${t('menu.units')}: ${t('units.' + units)}`
  }

  // --- Time of day slider ---
  const timeSec = section('menu.time')
  const timeSlider = document.createElement('input')
  timeSlider.type = 'range'
  timeSlider.min = '0'
  timeSlider.max = '1'
  timeSlider.step = '0.005'
  timeSlider.value = String(initial.time)
  timeSlider.style.cssText = 'width:100%'
  let timeDragging = false
  timeSlider.addEventListener('pointerdown', () => (timeDragging = true))
  window.addEventListener('pointerup', () => (timeDragging = false))
  timeSlider.addEventListener('input', () => cb.onSetTime(Number(timeSlider.value)))
  timeSec.appendChild(timeSlider)

  // --- Zoom --- (mirrors the +/- keys; higher = farther)
  const zoomSec = section('menu.zoom')
  const zoomSlider = document.createElement('input')
  zoomSlider.type = 'range'
  zoomSlider.min = '0.4'
  zoomSlider.max = '3'
  zoomSlider.step = '0.05'
  zoomSlider.value = String(initial.zoom)
  zoomSlider.style.cssText = 'width:100%;direction:rtl' // left = closer
  let zoomDragging = false
  zoomSlider.addEventListener('pointerdown', () => (zoomDragging = true))
  window.addEventListener('pointerup', () => (zoomDragging = false))
  zoomSlider.addEventListener('input', () => cb.onZoom(Number(zoomSlider.value)))
  zoomSec.appendChild(zoomSlider)

  // --- Location (the city input lives on the main screen; these act on it) ---
  const locSec = section('menu.city')
  const defBtn = button()
  defBtn.style.cssText += ';width:100%'
  defBtn.addEventListener('click', () => {
    const q = cityInput.value.trim()
    if (!q) return
    cb.onSetDefaultCity(q)
    defBtn.textContent = '✓'
    setTimeout(paintText, 1200)
  })
  const shareBtn = button()
  shareBtn.style.cssText += ';width:100%;margin-top:6px'
  shareBtn.addEventListener('click', () => {
    cb.onShareCity()
    shareBtn.textContent = '✓ ' + t('menu.shared')
    setTimeout(paintText, 1400)
  })
  const resetLocBtn = button()
  resetLocBtn.style.cssText += ';width:100%;margin-top:6px;background:#2f3d4f'
  resetLocBtn.addEventListener('click', () => cb.onResetLocation())
  const resetBtn = button()
  resetBtn.style.cssText += ';width:100%;margin-top:6px;background:#5a2a30'
  resetBtn.addEventListener('click', () => cb.onReset())
  locSec.append(defBtn, shareBtn, resetLocBtn, resetBtn)

  // --- About ---
  const aboutSec = section('about.title')
  const aboutDesc = document.createElement('div')
  aboutDesc.style.cssText = 'font-size:12px;color:rgba(255,255,255,.72);line-height:1.5;margin-bottom:4px'
  labels.push({ el: aboutDesc, key: 'about.description' })
  const aboutLink = (href: string, key: string): HTMLAnchorElement => {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.cssText =
      'display:block;padding:8px 11px;margin-top:6px;border-radius:6px;color:#fff;text-decoration:none;' +
      `font-size:14px;background:${IDLE};text-align:center`
    labels.push({ el: a, key })
    return a
  }
  const aboutVersion = document.createElement('div')
  aboutVersion.textContent = `v${__APP_VERSION__}`
  aboutVersion.title = 'Race the City version'
  aboutVersion.style.cssText = 'font-size:11px;color:rgba(255,255,255,.45);text-align:center;margin-top:8px'
  aboutSec.append(
    aboutDesc,
    aboutLink('https://github.com/kryadov', 'about.developer'),
    aboutLink('https://github.com/sponsors/kryadov', 'about.support'),
    aboutVersion,
  )

  root.appendChild(overlay)

  // ======================================================================== //
  //  Painting
  // ======================================================================== //
  const paintSession = (): void => {
    // In a live session the big button resumes/applies; the "resume the saved
    // session" Continue is redundant, so it hides. Otherwise it's the splash.
    playBtn.textContent = '▶ ' + (live ? t('menu.resume') : t('start.play'))
    continueBtn.style.display = !live && hasSession ? 'block' : 'none'
  }
  const paintText = (): void => {
    // Main screen
    title.textContent = t('start.title')
    subtitle.textContent = t('start.subtitle')
    goBtn.textContent = t('input.go')
    cityInput.placeholder = t('input.placeholder')
    randomBtn.textContent = t('start.random')
    carLabel.textContent = t('start.car')
    moreBtn.textContent = t('start.more')
    modeLabel.textContent = t('start.mode')
    for (const [m, b] of modeBtns) {
      // `arcade` has no short label — show a joystick, name it via the tooltip.
      b.textContent = m === 'arcade' ? '🕹' : t(MODE_KEY[m])
      if (m === 'arcade') b.title = t('menu.arcade')
    }
    optionsBtn.textContent = '⚙ ' + t('menu.title')
    paintSession()
    // Options screen
    aboutDesc.textContent = t('about.description')
    defBtn.textContent = '★ ' + t('menu.setDefault')
    shareBtn.textContent = '🔗 ' + t('menu.share')
    resetLocBtn.textContent = '📍 ' + t('menu.resetLocation')
    resetBtn.textContent = t('menu.reset')
    for (const { el, key } of labels) el.textContent = t(key)
  }
  function paintStates(): void {
    for (const [l, b] of langBtns) b.style.background = l === getLang() ? ACTIVE : IDLE
    for (const [l, b] of langButtons) b.style.background = getLang() === l ? ACTIVE : IDLE
    dayBtn.textContent = t('view.day')
    neonBtn.textContent = t('view.neon')
    dayBtn.style.background = view === 'day' ? ACTIVE : IDLE
    neonBtn.style.background = view === 'neon' ? ACTIVE : IDLE
    for (const [d, b] of densityBtns) {
      b.textContent = t('density.' + d)
      b.style.background = d === density ? ACTIVE : IDLE
    }
    for (const [type, b] of carBtns) b.style.background = type === vehicle ? ACTIVE : IDLE
    for (const [k, b] of modeBtns) b.style.background = k === mode ? ACTIVE : IDLE
  }
  const paint = (): void => {
    paintText()
    paintStates()
    paintAudio()
    paintMelody()
    paintToggles()
    paintWeather()
    paintTimeMode()
    paintQuality()
    paintUnits()
  }
  paint()
  // Highlight the initial mode/vehicle WITHOUT firing their swap callbacks — the
  // game already has this car and mode, and the callbacks run before the first
  // city has loaded.
  pickMode('free', false)
  onLangChange(paint)

  // ======================================================================== //
  //  Screen + backdrop control
  // ======================================================================== //
  const showMain = (): void => {
    mainScreen.style.display = 'flex'
    optionsScreen.style.display = 'none'
  }
  const showOptions = (): void => {
    mainScreen.style.display = 'none'
    optionsScreen.style.display = 'flex'
  }
  showMain() // start on the main screen (normalises the display props set in cssText)

  let loadingMode = false // true while a Random/search load runs behind the backdrop
  let revealTimer: ReturnType<typeof setTimeout> | undefined

  return {
    open() {
      // Bring the interactive menu back (start, Esc, or after a failed load),
      // leaving the synthwave backdrop as-is behind it. Always land on MAIN.
      loadingMode = false
      showMain()
      panel.style.display = 'block'
      overlay.style.display = 'flex'
      paintText()
    },
    close() {
      loadingMode = false
      panel.style.display = 'block'
      overlay.style.display = 'none'
    },
    toggle() {
      if (overlay.style.display === 'none') this.open()
      else this.close()
    },
    visible() {
      return overlay.style.display !== 'none'
    },
    setSessionLive(on) {
      live = on
      paintSession()
    },
    setVehicle(type) {
      vehicle = type
      for (const [k, b] of carBtns) b.style.background = k === type ? ACTIVE : IDLE
    },
    setCity(query) {
      cityInput.value = query
    },
    setMode(m) {
      pickMode(m, false)
    },
    setViewMode(m) {
      view = m
      paintStates()
    },
    setTime(tt) {
      if (!timeDragging) timeSlider.value = String(tt)
    },
    setZoom(v) {
      if (!zoomDragging) zoomSlider.value = String(v)
    },
    enterLoading() {
      // Random / city-search: drop the menu controls but keep the animated backdrop
      // up as a loading screen — no black void — until revealCity().
      loadingMode = true
      clearTimeout(revealTimer)
      panel.style.display = 'none'
      backdrop.style.display = 'block'
      backdrop.style.opacity = '1'
      overlay.style.display = 'flex'
    },
    revealCity() {
      clearTimeout(revealTimer)
      backdrop.style.opacity = '0'
      const wasLoading = loadingMode
      loadingMode = false
      // Stop the floor/sun animating once invisible; if this load came from a
      // Play/Random pick, dismiss the whole menu now its city is up (an idle
      // backdrop load leaves the menu in place over the live demo instead).
      revealTimer = setTimeout(() => {
        backdrop.style.display = 'none'
        if (wasLoading) {
          overlay.style.display = 'none'
          panel.style.display = 'block'
          showMain()
        }
      }, 900)
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

/** A compact Options-screen button (the old side menu's style). */
function button(): HTMLButtonElement {
  const b = document.createElement('button')
  b.style.cssText = `padding:7px 11px;border:0;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;background:${IDLE}`
  return b
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
  // The floor rolls toward the viewer and the sun breathes — WAAPI, so nothing
  // has to be injected into a stylesheet. Skipped under boot-check: its headless
  // Chrome runs on a virtual-time budget that never settles while an infinite
  // animation is pending, so --dump-dom would hang (the page still renders, which
  // is all boot-check checks).
  if (!(window as unknown as { __BOOTCHECK?: boolean }).__BOOTCHECK) {
    grid.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: '0 66px' }], { duration: 1600, iterations: Infinity })
    sun.animate(
      [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.05)' }],
      { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
    )
  }
  return wrap
}
