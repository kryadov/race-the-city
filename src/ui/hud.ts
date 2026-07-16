import { t, onLangChange } from '../i18n/i18n'

export interface Hud {
  setSpeed(kmh: number): void
  setCity(name: string): void
}

/** Bottom-centre HUD: current city name and speed in km/h. */
export function createHud(root: HTMLElement): Hud {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);text-align:center;' +
    'color:#fff;font-family:system-ui,sans-serif;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.6)'

  const city = document.createElement('div')
  city.style.cssText = 'font-size:15px;opacity:.85;margin-bottom:2px'

  const speedLine = document.createElement('div')
  const speedNum = document.createElement('span')
  speedNum.style.cssText = 'font-size:34px;font-weight:700;line-height:1'
  speedNum.textContent = '0'
  const unit = document.createElement('span')
  unit.style.cssText = 'font-size:14px;opacity:.8;margin-left:4px'
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
  }
}
