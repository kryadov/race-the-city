import { t, onLangChange } from '../i18n/i18n'
import { formatLap, type TrialState } from '../app/timeTrial'

export interface TrialHud {
  set(state: TrialState): void
  setVisible(on: boolean): void
}

/** Lap clock, gate count and personal best, under the minimap. */
export function createTrialHud(root: HTMLElement): TrialHud {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:200px;left:16px;pointer-events:none;display:none;' +
    'background:rgba(11,14,19,.8);color:#fff;padding:8px 12px;border-radius:10px;' +
    'font:14px system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);min-width:140px'

  const lap = document.createElement('div')
  lap.style.cssText = 'font-size:22px;font-variant-numeric:tabular-nums;font-weight:600'
  const gates = document.createElement('div')
  gates.style.cssText = 'font-size:12px;opacity:.8;margin-top:2px'
  const best = document.createElement('div')
  best.style.cssText = 'font-size:12px;opacity:.8;font-variant-numeric:tabular-nums'
  box.append(lap, gates, best)
  root.appendChild(box)

  let last: TrialState | null = null
  const paint = (): void => {
    if (!last) return
    lap.textContent = last.elapsed === null ? '—' : formatLap(last.elapsed)
    gates.textContent = `${t('trial.gates')}: ${last.taken}/${last.total}`
    best.textContent = `${t('trial.best')}: ${last.best === null ? '—' : formatLap(last.best)}`
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
