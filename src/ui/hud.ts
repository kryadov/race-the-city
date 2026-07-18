import { t, onLangChange } from '../i18n/i18n'
import { LOW } from '../vehicle/fuel'

/** Display units: metric (km/h, km) or imperial (mph, mi). */
export type Units = 'km' | 'mi'
export const UNITS: readonly Units[] = ['km', 'mi']
const MI_PER_KM = 0.621371

export interface Hud {
  setSpeed(kmh: number): void
  /** How full the tank is, 0..1. */
  setFuel(fuel: number): void
  /** Total distance driven, in metres. */
  setDistance(metres: number): void
  setUnits(u: Units): void
  setCity(name: string): void
  setVisible(on: boolean): void
}

const NS = 'http://www.w3.org/2000/svg'
// SIZE is the gauge's own coordinate system, which the dial geometry below is
// laid out in — DISPLAY is how big it lands on screen. Keeping them apart lets
// the gauge match the minimap without redoing every tick and needle by hand.
const SIZE = 120
const DISPLAY = 172 // same as the minimap's diameter, so the corners balance
const CX = 60
const CY = 60
const R = 48
const START = 135 // degrees (bottom-left of the gap)
const SWEEP = 270 // degrees, clockwise through the top
const MAX_KMH = 200

const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  return e
}
const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

/** Compact speedometer gauge (fixed size) under the ⚙ button, with the city name. */
export function createHud(root: HTMLElement, initialUnits: Units = 'km'): Hud {
  let units = initialUnits
  let kmh = 0
  let metres = 0
  let fuel = 1
  const box = document.createElement('div')
  box.style.cssText =
    `position:absolute;bottom:16px;left:16px;width:${DISPLAY}px;pointer-events:none;text-align:center;` +
    'font-family:system-ui,sans-serif'

  const city = document.createElement('div')
  city.style.cssText =
    'font-size:12px;color:rgba(255,255,255,.8);margin-bottom:2px;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.7)'

  const svg = svgEl('svg', { width: DISPLAY, height: DISPLAY, viewBox: `0 0 ${SIZE} ${SIZE}` })

  const [tx0, ty0] = polar(START, R)
  const [tx1, ty1] = polar(START + SWEEP, R)
  svg.appendChild(
    svgEl('path', {
      d: `M ${tx0} ${ty0} A ${R} ${R} 0 1 1 ${tx1} ${ty1}`,
      fill: 'none',
      stroke: 'rgba(255,255,255,.25)',
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
  )
  for (let i = 0; i <= 5; i++) {
    const [ox, oy] = polar(START + (SWEEP * i) / 5, R)
    const [ix, iy] = polar(START + (SWEEP * i) / 5, R - 6)
    svg.appendChild(svgEl('line', { x1: ox, y1: oy, x2: ix, y2: iy, stroke: 'rgba(255,255,255,.4)', 'stroke-width': 2 }))
  }

  const needle = svgEl('line', {
    x1: CX,
    y1: CY,
    x2: CX,
    y2: CY,
    stroke: '#e63946',
    'stroke-width': 3,
    'stroke-linecap': 'round',
  })
  svg.appendChild(needle)
  svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: 4, fill: '#e63946' }))

  const num = svgEl('text', {
    x: CX,
    y: CY + 26,
    'text-anchor': 'middle',
    fill: '#fff',
    'font-size': 20,
    'font-weight': 700,
  })
  num.textContent = '0'
  svg.appendChild(num)
  const unit = svgEl('text', { x: CX, y: CY + 38, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.6)', 'font-size': 9 })
  svg.appendChild(unit)

  // Odometer: total distance driven, under the gauge.
  const odo = document.createElement('div')
  odo.style.cssText =
    'font-size:12px;color:rgba(255,255,255,.85);margin-top:-6px;font-variant-numeric:tabular-nums;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.7)'

  // A bar rather than a second dial: one needle is a speedometer, two needles
  // is an instrument panel, and this game is played through the windscreen.
  const gauge = document.createElement('div')
  gauge.style.cssText =
    'width:120px;height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden'
  const level = document.createElement('div')
  level.style.cssText = 'height:100%;width:100%;background:#5ad07a;transition:width .2s linear'
  gauge.appendChild(level)
  // Bottom-right stack: the odometer over the fuel bar — both off the speedometer,
  // where the eye lands leaving the road, not tucked under the dial.
  const fuelBox = document.createElement('div')
  fuelBox.style.cssText =
    'position:absolute;bottom:16px;right:16px;pointer-events:none;display:flex;flex-direction:column;' +
    'align-items:flex-end;gap:4px;font-family:system-ui,sans-serif;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))'
  const fuelRow = document.createElement('div')
  fuelRow.style.cssText = 'display:flex;align-items:center;gap:7px'
  const fuelIcon = document.createElement('div')
  fuelIcon.textContent = '⛽'
  fuelIcon.style.cssText = 'font-size:16px'
  fuelRow.append(fuelIcon, gauge)
  odo.style.marginTop = '0'
  fuelBox.append(odo, fuelRow)

  const paint = (): void => {
    // The needle tracks true speed; only the readout changes with units.
    const frac = Math.max(0, Math.min(1, kmh / MAX_KMH))
    const [nx, ny] = polar(START + SWEEP * frac, R - 12)
    needle.setAttribute('x2', String(nx))
    needle.setAttribute('y2', String(ny))
    const imperial = units === 'mi'
    num.textContent = String(Math.round(imperial ? kmh * MI_PER_KM : kmh))
    unit.textContent = t(imperial ? 'hud.mph' : 'hud.kmh')
    const dist = (metres / 1000) * (imperial ? MI_PER_KM : 1)
    odo.textContent = `${dist.toFixed(dist < 100 ? 1 : 0)} ${t(imperial ? 'hud.mi' : 'hud.km')}`
    level.style.width = `${Math.max(0, Math.min(1, fuel)) * 100}%`
    // Amber then red: the colour is the warning, since there is no room here for
    // words and nobody reads a number on a bar anyway.
    level.style.background = fuel > LOW ? '#5ad07a' : fuel > LOW / 2 ? '#e8b23a' : '#e0503a'
  }
  paint()
  onLangChange(paint)

  box.append(city, svg)
  root.appendChild(box)
  root.appendChild(fuelBox)

  return {
    setSpeed(v) {
      kmh = v
      paint()
    },
    setDistance(v) {
      metres = v
      paint()
    },
    setFuel(v) {
      fuel = v
      paint()
    },
    setUnits(u) {
      units = u
      paint()
    },
    setCity(name) {
      city.textContent = name
    },
    setVisible(on) {
      box.style.display = on ? 'block' : 'none'
      fuelBox.style.display = on ? 'flex' : 'none'
    },
  }
}
