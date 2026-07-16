import { t, onLangChange } from '../i18n/i18n'

export interface Hud {
  setSpeed(kmh: number): void
  setCity(name: string): void
  setVisible(on: boolean): void
}

const NS = 'http://www.w3.org/2000/svg'
const SIZE = 120
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
export function createHud(root: HTMLElement): Hud {
  const box = document.createElement('div')
  box.style.cssText =
    `position:absolute;top:66px;right:16px;width:${SIZE}px;pointer-events:none;text-align:center;` +
    'font-family:system-ui,sans-serif'

  const city = document.createElement('div')
  city.style.cssText =
    'font-size:12px;color:rgba(255,255,255,.8);margin-bottom:2px;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.7)'

  const svg = svgEl('svg', { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}` })

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
  const paintUnit = (): void => {
    unit.textContent = t('hud.kmh')
  }
  paintUnit()
  onLangChange(paintUnit)
  svg.appendChild(unit)

  box.append(city, svg)
  root.appendChild(box)

  return {
    setSpeed(kmh) {
      const frac = Math.max(0, Math.min(1, kmh / MAX_KMH))
      const [nx, ny] = polar(START + SWEEP * frac, R - 12)
      needle.setAttribute('x2', String(nx))
      needle.setAttribute('y2', String(ny))
      num.textContent = String(Math.round(kmh))
    },
    setCity(name) {
      city.textContent = name
    },
    setVisible(on) {
      box.style.display = on ? 'block' : 'none'
    },
  }
}
