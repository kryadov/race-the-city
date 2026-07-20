import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMenu, type MenuCallbacks, type MenuInit } from '../../src/ui/menu'
import { setLang } from '../../src/i18n/i18n'

// The suite runs under vitest's `node` environment (no jsdom in the project), so
// menu.ts's DOM is served by this compact stub — just enough of Element / document
// / window / localStorage for the widgets the menu builds and the clicks we fire.
class El {
  tagName: string
  children: El[] = []
  style: Record<string, string> = { cssText: '' }
  dataset: Record<string, string> = {}
  textContent = ''
  value = ''
  type = ''
  min = ''
  max = ''
  step = ''
  placeholder = ''
  accept = ''
  title = ''
  href = ''
  target = ''
  rel = ''
  disabled = false
  files: unknown = null
  private listeners: Record<string, Array<(e: unknown) => void>> = {}
  constructor(tag: string) {
    this.tagName = tag.toUpperCase()
  }
  appendChild(c: El): El {
    this.children.push(c)
    return c
  }
  append(...cs: El[]): void {
    for (const c of cs) this.appendChild(c)
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    ;(this.listeners[type] ||= []).push(fn)
  }
  removeEventListener(): void {}
  dispatch(type: string, e: unknown = {}): void {
    for (const fn of this.listeners[type] || []) fn(e)
  }
  click(): void {
    this.dispatch('click', { stopPropagation() {}, preventDefault() {} })
  }
  animate(): { cancel(): void } {
    return { cancel() {} }
  }
}

function installDom(): void {
  const g = globalThis as unknown as {
    document: unknown
    window: unknown
    localStorage: unknown
  }
  const store = new Map<string, string>()
  g.document = { createElement: (tag: string) => new El(tag) }
  g.window = { addEventListener() {}, removeEventListener() {}, __BOOTCHECK: true }
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

/** Depth-first collect of stub elements matching a predicate. */
function findAll(root: El, pred: (el: El) => boolean): El[] {
  const out: El[] = []
  const rec = (n: El): void => {
    if (pred(n)) out.push(n)
    for (const c of n.children) rec(c)
  }
  rec(root)
  return out
}
const find = (root: El, pred: (el: El) => boolean): El => findAll(root, pred)[0]
const byRole = (root: El, role: string): El => find(root, (e) => e.dataset.role === role)

const INIT: MenuInit = {
  city: '',
  vehicle: 'car',
  hasSession: true,
  view: 'day',
  audio: { sound: true, music: true, soundVol: 0.5, musicVol: 0.3, track: 0 },
  roadLabels: false,
  time: 0.35,
  driftFx: true,
  hud: true,
  shadows: true,
  clouds: true,
  roadDetail: true,
  nitro: true,
  fuel: true,
  fuelRate: 1,
  demo: false,
  quality: 'normal',
  density: 'normal',
  units: 'km',
  weather: 'auto',
  timeMode: 'cycle',
  zoom: 1,
}

/** A callbacks object with every method stubbed; override the ones a test asserts. */
function stubCallbacks(over: Partial<MenuCallbacks> = {}): MenuCallbacks {
  const noop = (): void => {}
  return {
    onPlay: noop,
    onContinue: noop,
    onCity: noop,
    onRandom: noop,
    onVehicle: noop,
    onMode: noop,
    onSetDefaultCity: noop,
    onShareCity: noop,
    onSetView: noop,
    onAudioChange: noop,
    onCustomMusic: noop,
    onRoadLabels: noop,
    onSetTime: noop,
    onDriftFx: noop,
    onHud: noop,
    onShadows: noop,
    onClouds: noop,
    onRoadDetail: noop,
    onNitro: noop,
    onFuel: noop,
    onFuelRate: noop,
    onDemo: noop,
    onQuality: noop,
    onDensity: noop,
    onUnits: noop,
    onWeather: noop,
    onTimeMode: noop,
    onZoom: noop,
    onResetLocation: noop,
    onReset: noop,
    ...over,
  }
}

function mount(cb: MenuCallbacks, init: MenuInit = INIT): { root: El; handle: ReturnType<typeof createMenu> } {
  const root = new El('div')
  const handle = createMenu(root as unknown as HTMLElement, cb, init)
  return { root, handle }
}

describe('createMenu', () => {
  beforeEach(() => {
    installDom()
    setLang('en') // a prior test may have switched the shared i18n state
  })

  it('mode picker is single-select and calls onMode', () => {
    const onMode = vi.fn()
    const { root } = mount(stubCallbacks({ onMode }))
    const modeBtns = findAll(root, (e) => !!e.dataset.mode)
    expect(modeBtns.map((b) => b.dataset.mode)).toEqual(['free', 'trial', 'race', 'taxi', 'arcade'])

    const race = modeBtns.find((b) => b.dataset.mode === 'race')!
    race.click()
    expect(onMode).toHaveBeenCalledWith('race')
    // Exactly one button wears the active colour — race.
    const activeBg = race.style.background
    expect(modeBtns.filter((b) => b.style.background === activeBg)).toEqual([race])

    const taxi = modeBtns.find((b) => b.dataset.mode === 'taxi')!
    taxi.click()
    expect(onMode).toHaveBeenLastCalledWith('taxi')
    expect(modeBtns.filter((b) => b.style.background === taxi.style.background)).toEqual([taxi])
  })

  it('⚙ Options ↔ ← Back swaps the two screens', () => {
    const { root } = mount(stubCallbacks())
    const main = find(root, (e) => e.dataset.screen === 'main')
    const options = find(root, (e) => e.dataset.screen === 'options')
    expect(main.style.display).not.toBe('none')
    expect(options.style.display).toBe('none')

    byRole(root, 'options').click()
    expect(main.style.display).toBe('none')
    expect(options.style.display).not.toBe('none')

    byRole(root, 'back').click()
    expect(main.style.display).not.toBe('none')
    expect(options.style.display).toBe('none')
  })

  it('setSessionLive flips PLAY↔Resume and hides Continue', () => {
    const { root, handle } = mount(stubCallbacks(), { ...INIT, hasSession: true })
    const play = byRole(root, 'play')
    const cont = byRole(root, 'continue')
    // Fresh (no live session, a saved session exists): Play + Continue offered.
    expect(play.textContent).toContain('Play')
    expect(cont.style.display).not.toBe('none')

    handle.setSessionLive(true)
    expect(play.textContent).toContain('Resume')
    expect(cont.style.display).toBe('none')

    handle.setSessionLive(false)
    expect(play.textContent).toContain('Play')
    expect(cont.style.display).not.toBe('none')
  })

  it('Continue stays hidden when there is no saved session', () => {
    const { root } = mount(stubCallbacks(), { ...INIT, hasSession: false })
    expect(byRole(root, 'continue').style.display).toBe('none')
  })

  it('the language quick-toggle switches the copy', () => {
    const { root } = mount(stubCallbacks())
    const title = byRole(root, 'title')
    expect(title.textContent).toBe('RACE THE CITY')

    find(root, (e) => e.dataset.lang === 'ru').click()
    expect(title.textContent).toBe('МЧИСЬ ПО ГОРОДУ')
  })

  it('Play fires onPlay with the picked mode', () => {
    const onPlay = vi.fn()
    const { root } = mount(stubCallbacks({ onPlay }))
    find(root, (e) => e.dataset.mode === 'trial').click()
    byRole(root, 'play').click()
    expect(onPlay).toHaveBeenCalledWith('trial')
  })
})
