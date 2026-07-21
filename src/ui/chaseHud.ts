import { t, onLangChange } from '../i18n/i18n'
import type { ChaseState } from '../app/chase'

/** Within this many metres, the HUD drops the number for a red "⚠ close!" warning. */
const CLOSE_WARN = 25

export interface ChaseHud {
  set(state: ChaseState): void
  setVisible(on: boolean): void
}

/** The chase meter: evade the police, the time left, the nearest cop's distance, and the score. Under the minimap. */
export function createChaseHud(root: HTMLElement): ChaseHud {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:200px;left:16px;pointer-events:none;display:none;' +
    'background:rgba(11,14,19,.8);color:#fff;padding:8px 12px;border-radius:10px;' +
    'font:14px system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);min-width:150px'

  const objective = document.createElement('div')
  objective.style.cssText = 'font-size:15px;font-weight:600'
  const gap = document.createElement('div')
  gap.style.cssText = 'font-size:12px;opacity:.85;margin-top:1px'
  const timer = document.createElement('div')
  timer.style.cssText = 'font-size:22px;font-variant-numeric:tabular-nums;font-weight:700;margin-top:1px'
  const score = document.createElement('div')
  score.style.cssText = 'font-size:12px;opacity:.85;margin-top:2px;font-variant-numeric:tabular-nums'
  box.append(objective, gap, timer, score)
  root.appendChild(box)

  let last: ChaseState | null = null
  const paint = (): void => {
    if (!last) return
    objective.textContent = t('chase.objective')
    const close = last.nearest < CLOSE_WARN
    gap.textContent = Number.isFinite(last.nearest)
      ? close
        ? t('chase.close')
        : `🚓 ${Math.round(last.nearest)} m`
      : ''
    gap.style.color = close ? '#ff6363' : '#fff'
    timer.textContent = `${Math.ceil(last.timeLeft)}s`
    timer.style.color = last.timeLeft < 10 ? '#ff6363' : '#fff'
    score.textContent = `${t('chase.escaped')}: ${last.score}`
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
