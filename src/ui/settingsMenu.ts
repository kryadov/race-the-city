import { t, getLang, setLang, onLangChange, LANGS } from '../i18n/i18n'
import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'
import type { ViewMode } from '../app/theme'
import { type AudioState, TRACK_NAMES } from '../audio/audio'
import { WEATHERS, type Weather } from '../app/weather'

const WEATHER_EMOJI: Record<Weather, string> = { clear: '☀', rain: '🌧', snow: '❄', fog: '🌫' }

const VEHICLE_EMOJI: Record<VehicleType, string> = { car: '🚗', truck: '🚚', sports: '🏎' }
const ACTIVE = '#e63946'
const INACTIVE = '#26303f'

export interface SettingsCallbacks {
  onLoadCity: (query: string) => void
  onSetDefaultCity: (query: string) => void
  onSetView: (mode: ViewMode) => void
  onSelectVehicle: (type: VehicleType) => void
  onAudioChange: (patch: Partial<AudioState>) => void
  onRoadLabels: (on: boolean) => void
  onSetTime: (t: number) => void
  onDriftFx: (on: boolean) => void
  onHud: (on: boolean) => void
  onShadows: (on: boolean) => void
  onWeather: (w: Weather) => void
  onReset: () => void
}

export interface SettingsHandle {
  setViewMode(mode: ViewMode): void
  setVehicle(type: VehicleType): void
  setTime(t: number): void
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
    weather: Weather
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
  let weather = initial.weather

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
  function section(key: string): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'margin-bottom:14px'
    const lbl = document.createElement('div')
    lbl.style.cssText = 'opacity:.65;font-size:12px;margin-bottom:6px'
    labels.push({ el: lbl, key })
    wrap.appendChild(lbl)
    return wrap
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
  const defBtn = button()
  defBtn.style.cssText += ';width:100%;margin-top:6px'
  citySec.append(cityRow, defBtn)
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
  const vehRow = row()
  const vehButtons = new Map<VehicleType, HTMLButtonElement>()
  for (const type of VEHICLE_TYPES) {
    const b = button()
    b.addEventListener('click', () => {
      cb.onSelectVehicle(type)
      setVehicle(type)
    })
    vehButtons.set(type, b)
    vehRow.appendChild(b)
  }
  vehSec.appendChild(vehRow)

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
  audioSec.append(sound.r, music.r, melodyBtn)
  function paintAudio(): void {
    sound.btn.textContent = audio.sound ? '🔊' : '🔇'
    music.btn.textContent = audio.music ? '🎵' : '🔕'
  }
  function paintMelody(): void {
    melodyBtn.textContent = `🎶 ${TRACK_NAMES[audio.track]}`
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
  function paintLabelsToggle(): void {
    labelsBtn.textContent = `${roadLabels ? '☑' : '☐'} ${t('menu.roadLabels')}`
    driftBtn.textContent = `${driftFx ? '☑' : '☐'} ${t('menu.driftFx')}`
    hudBtn.textContent = `${hud ? '☑' : '☐'} ${t('menu.hud')}`
    shadowsBtn.textContent = `${shadows ? '☑' : '☐'} ${t('menu.shadows')}`
  }

  const weatherBtn = button()
  weatherBtn.style.cssText += ';width:100%;margin-top:4px'
  weatherBtn.addEventListener('click', () => {
    weather = WEATHERS[(WEATHERS.indexOf(weather) + 1) % WEATHERS.length]
    cb.onWeather(weather)
    paintWeather()
  })
  mapSec.appendChild(weatherBtn)
  function paintWeather(): void {
    weatherBtn.textContent = `${WEATHER_EMOJI[weather]} ${t('weather.' + weather)}`
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

  const resetBtn = button()
  resetBtn.style.cssText += ';width:100%;margin-top:6px;background:#5a2a30'
  resetBtn.addEventListener('click', () => cb.onReset())

  panel.append(citySec, langSec, viewSec, vehSec, audioSec, mapSec, timeSec, resetBtn)
  root.append(gear, panel)

  function paintLabels(): void {
    gear.title = t('menu.title')
    input.placeholder = t('input.placeholder')
    goBtn.textContent = t('input.go')
    defBtn.textContent = '★ ' + t('menu.setDefault')
    resetBtn.textContent = t('menu.reset')
    for (const { el, key } of labels) el.textContent = t(key)
  }
  function paintStates(): void {
    for (const [l, b] of langButtons) b.style.background = getLang() === l ? ACTIVE : INACTIVE
    dayBtn.textContent = t('view.day')
    neonBtn.textContent = t('view.neon')
    dayBtn.style.background = view === 'day' ? ACTIVE : INACTIVE
    neonBtn.style.background = view === 'neon' ? ACTIVE : INACTIVE
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
    setTime(t: number) {
      if (!timeDragging) timeSlider.value = String(t)
    },
  }
}
