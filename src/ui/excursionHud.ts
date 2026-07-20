import { t, onLangChange } from '../i18n/i18n'
import type { ExcursionState } from '../app/excursion'

export interface ExcursionHud {
  set(state: ExcursionState): void
  setVisible(on: boolean): void
}

/** The tour meter: the next sight, how far, the time left, and how many you've seen. Under the minimap. */
export function createExcursionHud(root: HTMLElement): ExcursionHud {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:200px;left:16px;pointer-events:none;display:none;' +
    'background:rgba(11,14,19,.8);color:#fff;padding:8px 12px;border-radius:10px;' +
    'font:14px system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);min-width:150px'

  const objective = document.createElement('div')
  objective.style.cssText = 'font-size:15px;font-weight:600'
  const dist = document.createElement('div')
  dist.style.cssText = 'font-size:12px;opacity:.85;margin-top:1px'
  const timer = document.createElement('div')
  timer.style.cssText = 'font-size:22px;font-variant-numeric:tabular-nums;font-weight:700;margin-top:1px'
  const score = document.createElement('div')
  score.style.cssText = 'font-size:12px;opacity:.85;margin-top:2px;font-variant-numeric:tabular-nums'
  box.append(objective, dist, timer, score)
  root.appendChild(box)

  let last: ExcursionState | null = null
  const paint = (): void => {
    if (!last) return
    objective.textContent = t('excursion.objective')
    dist.textContent = last.distance > 0 ? `📍 ${Math.round(last.distance)} m` : ''
    dist.style.display = last.distance > 0 ? 'block' : 'none'
    timer.textContent = `${Math.ceil(last.timeLeft)}s`
    timer.style.color = last.timeLeft < 6 ? '#ff6363' : '#fff'
    score.textContent = `${t('excursion.visited')}: ${last.visited}`
  }
  onLangChange(paint)

  return {
    set(state) {
      last = state
      paint()
    },
    setVisible(on) {
      box.style.display = on ? 'block' : 'none'
    },
  }
}
