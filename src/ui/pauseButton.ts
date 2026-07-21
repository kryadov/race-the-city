import { t, onLangChange } from '../i18n/i18n'
import { cornerRight, CORNER_SIZE } from './cornerButtons'

export interface PauseButton {
  paused(): boolean
  set(on: boolean): void
}

/**
 * A pause button in the top-right corner, plus Escape as a shortcut. It only
 * reports state — the loop decides what freezing means.
 */
export function createPauseButton(root: HTMLElement, onChange: (paused: boolean) => void): PauseButton {
  let paused = false

  const btn = document.createElement('button')
  // Flush to the right edge (slot 0). The in-game settings button used to sit here
  // and the pause sat a slot to its left; settings has since moved into the menu
  // panel, so the pause takes the edge and the ? help button sits beside it.
  btn.style.cssText =
    `position:absolute;top:16px;right:${cornerRight(0)}px;pointer-events:auto;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px;` +
    'border:0;border-radius:10px;background:rgba(11,14,19,.8);color:#fff;font-size:18px;cursor:pointer'
  root.appendChild(btn)

  // A dimmed banner so a paused game can't be mistaken for a frozen one.
  const banner = document.createElement('div')
  banner.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;display:none;' +
    'background:rgba(11,14,19,.82);color:#fff;padding:10px 18px;border-radius:12px;' +
    'font:600 18px system-ui,sans-serif;letter-spacing:.04em'
  root.appendChild(banner)

  const paint = (): void => {
    btn.textContent = paused ? '▶' : '❚❚'
    btn.title = paused ? t('menu.resume') : t('menu.pause')
    banner.textContent = t('menu.paused')
    banner.style.display = paused ? 'block' : 'none'
  }

  const set = (on: boolean): void => {
    if (on === paused) return
    paused = on
    paint()
    onChange(paused)
  }

  btn.addEventListener('click', () => set(!paused))
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') set(!paused)
  })
  paint()
  onLangChange(paint)

  return { paused: () => paused, set }
}
