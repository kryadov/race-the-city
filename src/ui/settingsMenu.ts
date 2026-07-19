import { t, getLang, setLang, onLangChange, LANGS } from '../i18n/i18n'
import { VEHICLE_GROUPS, type VehicleType } from '../vehicle/vehicles'
import type { ViewMode } from '../app/theme'
import { type AudioState, TRACK_NAMES } from '../audio/audio'
import { WEATHER_SETTINGS, type WeatherSetting } from '../app/weather'
import { TIME_MODES, type TimeMode } from '../app/daynight'
import { pickRandomCity } from '../app/cities'
import { QUALITIES, type Quality } from '../app/scene'
import { DENSITIES, type Density } from '../app/density'
import { UNITS, type Units } from './hud'

const QUALITY_EMOJI: Record<Quality, string> = { low: '🐢', normal: '⚖', high: '✨' }

const WEATHER_EMOJI: Record<WeatherSetting, string> = { auto: '🔄', clear: '☀', rain: '🌧', snow: '❄', fog: '🌫' }

const TIME_EMOJI: Record<TimeMode, string> = { cycle: '🔄', day: '☀', night: '🌙' }

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  truck: '🚚',
  sports: '🏎',
  motorbike: '🏍',
  bus: '🚌',
  racecar: '🏁',
  tractor: '🚜',
  lorry: '🚛',
  cabrio: '🚙',
  retro: '🚘',
  ev: '🔌',
  minivan: '🚐',
  jeep: '🛻',
  pickup: '🛻',
  police: '🚓',
  tanker: '🛢',
  ambulance: '🚑',
  firetruck: '🚒',
  crane: '🏗',
  roller: '🛞',
  combine: '🌾',
  tiller: '⚙',
  tracked: '⛰',
  hover: '🛸',
}
const ACTIVE = '#e63946'
const INACTIVE = '#26303f'

export interface SettingsCallbacks {
  onLoadCity: (query: string) => void
  onSetDefaultCity: (query: string) => void
  onShareCity: () => void
  onSetView: (mode: ViewMode) => void
  onSelectVehicle: (type: VehicleType) => void
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
  onDemo: (on: boolean) => void
  onTrial: (on: boolean) => void
  onRace: (on: boolean) => void
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

export interface SettingsHandle {
  setViewMode(mode: ViewMode): void
  setVehicle(type: VehicleType): void
  /** The trial can be switched on from outside — racing needs its gates. */
  setTrial(on: boolean): void
  setTime(t: number): void
  setZoom(v: number): void
}

function button(): HTMLButtonElement {
  const b = document.createElement('button')
  b.style.cssText = `padding:7px 11px;border:0;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;background:${INACTIVE}`
  return b
}

/** ⚙ button that opens a panel holding every setting ("all in the menu"). */
export function createSettingsMenu(
  root: HTMLElement,
  initial: {
    city: string
    view: ViewMode
    vehicle: VehicleType
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
    demo: boolean
    trial: boolean
    race: boolean
    quality: Quality
    density: Density
    units: Units
    weather: WeatherSetting
    timeMode: TimeMode
    zoom: number
  },
  cb: SettingsCallbacks,
): SettingsHandle {
  let view = initial.view
  let vehicle = initial.vehicle
  let audio = initial.audio
  let roadLabels = initial.roadLabels
  let driftFx = initial.driftFx
  let hud = initial.hud
  let shadows = initial.shadows
  let clouds = initial.clouds
  let roadDetail = initial.roadDetail
  let nitro = initial.nitro
  let fuel = initial.fuel
  let demo = initial.demo
  let trial = initial.trial
  let race = initial.race
  let quality = initial.quality
  let density = initial.density
  let units = initial.units
  let weather = initial.weather
  let timeMode = initial.timeMode

  const gear = document.createElement('button')
  gear.textContent = '⚙'
  gear.style.cssText =
    'position:absolute;top:16px;right:16px;pointer-events:auto;width:44px;height:44px;' +
    'border:0;border-radius:10px;background:rgba(11,14,19,.8);color:#fff;font-size:20px;cursor:pointer'

  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;top:70px;right:16px;width:264px;pointer-events:auto;display:none;' +
    'max-height:calc(100vh - 90px);overflow-y:auto;' +
    'background:rgba(11,14,19,.94);color:#fff;padding:14px;border-radius:12px;' +
    'font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)'
  gear.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  })

  const labels: Array<{ el: HTMLElement; key: string }> = []

  // Which groups are expanded, remembered across sessions. Only the city group
  // opens by default so the panel stays short instead of a long scroll.
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

  /**
   * A collapsible group. Appends itself to the panel in creation order and
   * returns the body, which callers fill as before.
   */
  function section(key: string, parent: HTMLElement = panel): HTMLDivElement {
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

  // --- City ---
  const citySec = section('menu.city')
  const cityRow = row()
  const input = document.createElement('input')
  input.value = initial.city
  input.style.cssText = 'flex:1;min-width:0;padding:7px 9px;border:0;border-radius:6px;font-size:14px'
  const goBtn = button()
  goBtn.style.background = ACTIVE
  cityRow.append(input, goBtn)
  const randomBtn = button()
  randomBtn.style.cssText += ';width:100%;margin-top:6px'
  const defBtn = button()
  defBtn.style.cssText += ';width:100%;margin-top:6px'
  const shareBtn = button()
  shareBtn.style.cssText += ';width:100%;margin-top:6px'
  citySec.append(cityRow, randomBtn, defBtn, shareBtn)
  randomBtn.addEventListener('click', () => {
    const city = pickRandomCity(input.value.trim())
    input.value = city
    cb.onLoadCity(city)
  })
  shareBtn.addEventListener('click', () => {
    cb.onShareCity()
    shareBtn.textContent = '✓ ' + t('menu.shared')
    setTimeout(paintLabels, 1400)
  })
  const go = (): void => {
    const q = input.value.trim()
    if (q) cb.onLoadCity(q)
  }
  goBtn.addEventListener('click', go)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go()
  })
  defBtn.addEventListener('click', () => {
    const q = input.value.trim()
    if (!q) return
    cb.onSetDefaultCity(q)
    defBtn.textContent = '✓'
    setTimeout(paintLabels, 1200)
  })

  // --- Language ---
  const langSec = section('menu.language')
  const langRow = row()
  const langButtons = new Map<string, HTMLButtonElement>()
  for (const l of LANGS) {
    const b = button()
    b.textContent = l.toUpperCase()
    b.addEventListener('click', () => setLang(l))
    langButtons.set(l, b)
    langRow.appendChild(b)
  }
  langSec.appendChild(langRow)

  // --- View ---
  const viewSec = section('menu.view')
  const viewRow = row()
  const dayBtn = button()
  const neonBtn = button()
  dayBtn.addEventListener('click', () => cb.onSetView('day'))
  neonBtn.addEventListener('click', () => cb.onSetView('neon'))
  viewRow.append(dayBtn, neonBtn)
  viewSec.appendChild(viewRow)

  // --- Vehicle ---
  const vehSec = section('menu.vehicle')
  const vehButtons = new Map<VehicleType, HTMLButtonElement>()
  for (const group of VEHICLE_GROUPS) {
    const groupBody = section(group.key, vehSec)
    const groupRow = row()
    for (const type of group.types) {
      const b = button()
      b.addEventListener('click', () => {
        cb.onSelectVehicle(type)
        setVehicle(type)
      })
      vehButtons.set(type, b)
      groupRow.appendChild(b)
    }
    groupBody.appendChild(groupRow)
  }

  // --- Audio ---
  const audioSec = section('menu.audio')
  const audioRow = (vol: number, title: string): { r: HTMLDivElement; btn: HTMLButtonElement; slider: HTMLInputElement } => {
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
    slider.title = title
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
    // With an own track the built-in melody cycle doesn't apply.
    melodyBtn.textContent = customName ? `🎧 ${customName}` : `🎶 ${TRACK_NAMES[audio.track]}`
    melodyBtn.disabled = customName !== null
    melodyBtn.style.opacity = customName ? '0.5' : '1'
    customBtn.textContent = customName ? '✕ ' + t('menu.builtinTrack') : '📂 ' + t('menu.customTrack')
  }

  // --- Map / labels ---
  const mapSec = section('menu.map')
  const labelsBtn = button()
  labelsBtn.style.cssText += ';width:100%'
  labelsBtn.addEventListener('click', () => {
    roadLabels = !roadLabels
    cb.onRoadLabels(roadLabels)
    paintLabelsToggle()
  })
  mapSec.appendChild(labelsBtn)
  const driftBtn = button()
  driftBtn.style.cssText += ';width:100%;margin-top:4px'
  driftBtn.addEventListener('click', () => {
    driftFx = !driftFx
    cb.onDriftFx(driftFx)
    paintLabelsToggle()
  })
  mapSec.appendChild(driftBtn)
  const hudBtn = button()
  hudBtn.style.cssText += ';width:100%;margin-top:4px'
  hudBtn.addEventListener('click', () => {
    hud = !hud
    cb.onHud(hud)
    paintLabelsToggle()
  })
  mapSec.appendChild(hudBtn)
  const shadowsBtn = button()
  shadowsBtn.style.cssText += ';width:100%;margin-top:4px'
  shadowsBtn.addEventListener('click', () => {
    shadows = !shadows
    cb.onShadows(shadows)
    paintLabelsToggle()
  })
  mapSec.appendChild(shadowsBtn)
  const cloudsBtn = button()
  cloudsBtn.style.cssText += ';width:100%;margin-top:4px'
  cloudsBtn.addEventListener('click', () => {
    clouds = !clouds
    cb.onClouds(clouds)
    paintLabelsToggle()
  })
  mapSec.appendChild(cloudsBtn)
  const roadDetailBtn = button()
  roadDetailBtn.style.cssText += ';width:100%;margin-top:4px'
  roadDetailBtn.addEventListener('click', () => {
    roadDetail = !roadDetail
    cb.onRoadDetail(roadDetail)
    paintLabelsToggle()
  })
  mapSec.appendChild(roadDetailBtn)
  const nitroBtn = button()
  nitroBtn.style.cssText += ';width:100%;margin-top:4px'
  nitroBtn.addEventListener('click', () => {
    nitro = !nitro
    cb.onNitro(nitro)
    paintLabelsToggle()
  })
  mapSec.appendChild(nitroBtn)
  const fuelBtn = button()
  fuelBtn.style.cssText += ';width:100%;margin-top:4px'
  fuelBtn.addEventListener('click', () => {
    fuel = !fuel
    cb.onFuel(fuel)
    paintLabelsToggle()
  })
  mapSec.appendChild(fuelBtn)
  const demoBtn = button()
  demoBtn.style.cssText += ';width:100%;margin-top:4px'
  demoBtn.addEventListener('click', () => {
    demo = !demo
    cb.onDemo(demo)
    paintLabelsToggle()
  })
  mapSec.appendChild(demoBtn)
  const trialBtn = button()
  trialBtn.style.cssText += ';width:100%;margin-top:4px'
  trialBtn.addEventListener('click', () => {
    trial = !trial
    cb.onTrial(trial)
    paintLabelsToggle()
  })
  mapSec.appendChild(trialBtn)
  const raceBtn = button()
  raceBtn.style.cssText += ';width:100%;margin-top:4px'
  raceBtn.addEventListener('click', () => {
    race = !race
    cb.onRace(race)
    paintLabelsToggle()
  })
  mapSec.appendChild(raceBtn)
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
  function paintLabelsToggle(): void {
    labelsBtn.textContent = `${roadLabels ? '☑' : '☐'} ${t('menu.roadLabels')}`
    driftBtn.textContent = `${driftFx ? '☑' : '☐'} ${t('menu.driftFx')}`
    hudBtn.textContent = `${hud ? '☑' : '☐'} ${t('menu.hud')}`
    shadowsBtn.textContent = `${shadows ? '☑' : '☐'} ${t('menu.shadows')}`
    cloudsBtn.textContent = `${clouds ? '☑' : '☐'} ${t('menu.clouds')}`
    roadDetailBtn.textContent = `${roadDetail ? '☑' : '☐'} ${t('menu.roadDetail')}`
    nitroBtn.textContent = `${nitro ? '☑' : '☐'} ${t('menu.nitro')}`
    fuelBtn.textContent = `${fuel ? '☑' : '☐'} ${t('menu.fuel')}`
    demoBtn.textContent = `${demo ? '☑' : '☐'} ${t('menu.demo')}`
    trialBtn.textContent = `${trial ? '☑' : '☐'} ${t('menu.trial')}`
    raceBtn.textContent = `${race ? '☑' : '☐'} ${t('menu.race')}`
  }

  const weatherBtn = button()
  weatherBtn.style.cssText += ';width:100%;margin-top:4px'
  weatherBtn.addEventListener('click', () => {
    weather = WEATHER_SETTINGS[(WEATHER_SETTINGS.indexOf(weather) + 1) % WEATHER_SETTINGS.length]
    cb.onWeather(weather)
    paintWeather()
  })
  mapSec.appendChild(weatherBtn)
  function paintWeather(): void {
    weatherBtn.textContent = `${WEATHER_EMOJI[weather]} ${t('weather.' + weather)}`
  }

  // Time of day: cycle the full day/night loop, or lock to permanent day / night
  const timeBtn = button()
  timeBtn.style.cssText += ';width:100%;margin-top:4px'
  timeBtn.addEventListener('click', () => {
    timeMode = TIME_MODES[(TIME_MODES.indexOf(timeMode) + 1) % TIME_MODES.length]
    cb.onTimeMode(timeMode)
    paintTime()
  })
  mapSec.appendChild(timeBtn)
  function paintTime(): void {
    timeBtn.textContent = `${TIME_EMOJI[timeMode]} ${t('time.' + timeMode)}`
  }

  // Render quality: cycles low → normal → high (resolution scale, shadows, particles)
  const qualityBtn = button()
  qualityBtn.style.cssText += ';width:100%;margin-top:4px'
  qualityBtn.addEventListener('click', () => {
    quality = QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]
    cb.onQuality(quality)
    paintQuality()
  })
  mapSec.appendChild(qualityBtn)
  function paintQuality(): void {
    qualityBtn.textContent = `${QUALITY_EMOJI[quality]} ${t('menu.quality')}: ${t('quality.' + quality)}`
  }

  // Display units: km/h + km, or mph + miles
  const unitsBtn = button()
  unitsBtn.style.cssText += ';width:100%;margin-top:4px'
  unitsBtn.addEventListener('click', () => {
    units = UNITS[(UNITS.indexOf(units) + 1) % UNITS.length]
    cb.onUnits(units)
    paintUnits()
  })
  mapSec.appendChild(unitsBtn)
  function paintUnits(): void {
    unitsBtn.textContent = `📏 ${t('menu.units')}: ${t('units.' + units)}`
  }

  // --- Time of day ---
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

  const resetLocBtn = button()
  resetLocBtn.style.cssText += ';width:100%;margin-top:10px;background:#2f3d4f'
  resetLocBtn.addEventListener('click', () => cb.onResetLocation())
  const resetBtn = button()
  resetBtn.style.cssText += ';width:100%;margin-top:6px;background:#5a2a30'
  resetBtn.addEventListener('click', () => cb.onReset())

  // Sections append themselves as they're created; only the actions go last.
  // --- About ---
  const aboutSec = section('about.title')
  const aboutDesc = document.createElement('div')
  aboutDesc.style.cssText = 'font-size:12px;color:rgba(255,255,255,.72);line-height:1.5;margin-bottom:4px'
  aboutDesc.textContent = t('about.description')
  labels.push({ el: aboutDesc, key: 'about.description' })
  const aboutLink = (href: string, key: string): HTMLAnchorElement => {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = t(key)
    a.style.cssText =
      'display:block;padding:8px 11px;margin-top:6px;border-radius:6px;color:#fff;text-decoration:none;' +
      `font-size:14px;background:${INACTIVE};text-align:center`
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

  panel.append(resetLocBtn, resetBtn)
  root.append(gear, panel)

  function paintLabels(): void {
    gear.title = t('menu.title')
    input.placeholder = t('input.placeholder')
    goBtn.textContent = t('input.go')
    randomBtn.textContent = '🎲 ' + t('menu.random')
    defBtn.textContent = '★ ' + t('menu.setDefault')
    shareBtn.textContent = '🔗 ' + t('menu.share')
    resetLocBtn.textContent = '📍 ' + t('menu.resetLocation')
    resetBtn.textContent = t('menu.reset')
    for (const { el, key } of labels) el.textContent = t(key)
  }
  function paintStates(): void {
    for (const [l, b] of langButtons) b.style.background = getLang() === l ? ACTIVE : INACTIVE
    dayBtn.textContent = t('view.day')
    neonBtn.textContent = t('view.neon')
    dayBtn.style.background = view === 'day' ? ACTIVE : INACTIVE
    neonBtn.style.background = view === 'neon' ? ACTIVE : INACTIVE
    for (const [d, b] of densityBtns) {
      b.textContent = t('density.' + d)
      b.style.background = d === density ? ACTIVE : INACTIVE
    }
    for (const [type, b] of vehButtons) {
      b.textContent = `${VEHICLE_EMOJI[type]} ${t('vehicle.' + type)}`
      b.style.background = type === vehicle ? ACTIVE : INACTIVE
    }
  }
  const paint = (): void => {
    paintLabels()
    paintStates()
    paintAudio()
    paintMelody()
    paintLabelsToggle()
    paintWeather()
    paintTime()
    paintQuality()
    paintUnits()
  }
  paint()
  onLangChange(paint)

  function setVehicle(type: VehicleType): void {
    vehicle = type
    paintStates()
  }

  return {
    setViewMode(mode: ViewMode) {
      view = mode
      paintStates()
    },
    setVehicle,
    setTrial(on: boolean) {
      trial = on
      paintLabels()
    },
    setTime(t: number) {
      if (!timeDragging) timeSlider.value = String(t)
    },
    setZoom(v: number) {
      if (!zoomDragging) zoomSlider.value = String(v)
    },
  }
}
