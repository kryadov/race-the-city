import { t, onLangChange } from '../i18n/i18n'

export interface Hud {
  setSpeed(kmh: number): void
  setCity(name: string): void
  setVisible(on: boolean): void
}

/** Compact, muted panel under the ⚙ button: city name and speed in km/h. */
export function createHud(root: HTMLElement): Hud {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:70px;right:16px;pointer-events:none;text-align:right;' +
    'background:rgba(11,14,19,.45);padding:6px 12px;border-radius:10px;' +
    'font-family:system-ui,sans-serif;color:rgba(255,255,255,.92)'

  const city = document.createElement('div')
  city.style.cssText = 'font-size:12px;opacity:.65;margin-bottom:1px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

  const speedLine = document.createElement('div')
  const speedNum = document.createElement('span')
  speedNum.style.cssText = 'font-size:22px;font-weight:600;line-height:1'
  speedNum.textContent = '0'
  const unit = document.createElement('span')
  unit.style.cssText = 'font-size:12px;opacity:.6;margin-left:3px'
  const paintUnit = (): void => {
    unit.textContent = t('hud.kmh')
  }
  paintUnit()
  onLangChange(paintUnit)
  speedLine.append(speedNum, unit)

  box.append(city, speedLine)
  root.appendChild(box)

  return {
    setSpeed(kmh) {
      speedNum.textContent = String(Math.round(kmh))
    },
    setCity(name) {
      city.textContent = name
    },
    setVisible(on) {
      box.style.display = on ? 'block' : 'none'
    },
  }
}
