import { t, getLang, setLang, onLangChange, LANGS } from '../i18n/i18n'
import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'
import type { ViewMode } from '../app/theme'
import type { AudioState } from '../audio/audio'

const VEHICLE_EMOJI: Record<VehicleType, string> = { car: '🚗', truck: '🚚', sports: '🏎' }
const ACTIVE = '#e63946'
const INACTIVE = '#26303f'

export interface SettingsCallbacks {
  onLoadCity: (query: string) => void
  onSetDefaultCity: (query: string) => void
  onSetView: (mode: ViewMode) => void
  onSelectVehicle: (type: VehicleType) => void
  onAudioChange: (patch: Partial<AudioState>) => void
}

export interface SettingsHandle {
  setViewMode(mode: ViewMode): void
  setVehicle(type: VehicleType): void
}

function button(): HTMLButtonElement {
  const b = document.createElement('button')
  b.style.cssText = `padding:7px 11px;border:0;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;background:${INACTIVE}`
  return b
}

/** ⚙ button that opens a panel holding every setting ("all in the menu"). */
export function createSettingsMenu(
  root: HTMLElement,
  initial: { city: string; view: ViewMode; vehicle: VehicleType; audio: AudioState },
  cb: SettingsCallbacks,
): SettingsHandle {
  let view = initial.view
  let vehicle = initial.vehicle
  let audio = initial.audio

  const gear = document.createElement('button')
  gear.textContent = '⚙'
  gear.style.cssText =
    'position:absolute;top:16px;right:16px;pointer-events:auto;width:44px;height:44px;' +
    'border:0;border-radius:10px;background:rgba(11,14,19,.8);color:#fff;font-size:20px;cursor:pointer'

  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;top:70px;right:16px;width:264px;pointer-events:auto;display:none;' +
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
  audioSec.append(sound.r, music.r)
  function paintAudio(): void {
    sound.btn.textContent = audio.sound ? '🔊' : '🔇'
    music.btn.textContent = audio.music ? '🎵' : '🔕'
  }

  panel.append(citySec, langSec, viewSec, vehSec, audioSec)
  root.append(gear, panel)

  function paintLabels(): void {
    gear.title = t('menu.title')
    input.placeholder = t('input.placeholder')
    goBtn.textContent = t('input.go')
    defBtn.textContent = '★ ' + t('menu.setDefault')
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
  }
}
