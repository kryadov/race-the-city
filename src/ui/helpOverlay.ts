import { t, onLangChange } from '../i18n/i18n'

/** Every binding, read off the code that implements it. */
const KEYS: readonly { keys: string; label: string }[] = [
  { keys: 'W ↑', label: 'help.throttle' },
  { keys: 'S ↓', label: 'help.reverse' },
  { keys: 'A D ← →', label: 'help.steer' },
  { keys: 'Space', label: 'help.brake' },
  { keys: 'H', label: 'help.horn' },
  { keys: 'Esc', label: 'help.pause' },
  { keys: '⚙', label: 'help.menu' },
]

export interface HelpOverlay {
  toggle(): void
}

/**
 * The controls, on a card you can call up.
 *
 * Nothing else in the game says the horn is on H or that Escape pauses — the
 * only way to find out was to be told.
 */
export function createHelpOverlay(root: HTMLElement): HelpOverlay {
  let open = false

  const btn = document.createElement('button')
  btn.textContent = '?'
  // Third in the row along the top right, after the pause and the gear.
  btn.style.cssText =
    'position:absolute;top:16px;right:120px;pointer-events:auto;width:44px;height:44px;' +
    'border:0;border-radius:10px;background:rgba(11,14,19,.8);color:#fff;font-size:19px;cursor:pointer'
  root.appendChild(btn)

  const card = document.createElement('div')
  card.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;display:none;' +
    'background:rgba(11,14,19,.94);color:#fff;padding:18px 22px;border-radius:14px;' +
    'font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);min-width:260px'
  root.appendChild(card)

  const title = document.createElement('div')
  title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:10px'
  const rows = document.createElement('div')
  rows.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:6px 14px;align-items:center'
  const hint = document.createElement('div')
  hint.style.cssText = 'margin-top:12px;font-size:12px;opacity:.6'
  card.append(title, rows, hint)

  const paint = (): void => {
    title.textContent = t('help.title')
    hint.textContent = t('help.hint')
    rows.textContent = ''
    for (const k of KEYS) {
      const key = document.createElement('span')
      key.textContent = k.keys
      key.style.cssText =
        'font:600 12px ui-monospace,monospace;background:#26303f;padding:4px 8px;border-radius:5px;' +
        'text-align:center;white-space:nowrap'
      const what = document.createElement('span')
      what.textContent = t(k.label)
      what.style.opacity = '.9'
      rows.append(key, what)
    }
  }

  const set = (v: boolean): void => {
    open = v
    card.style.display = open ? 'block' : 'none'
    btn.style.background = open ? '#e63946' : 'rgba(11,14,19,.8)'
  }

  btn.addEventListener('click', () => set(!open))
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Slash') set(!open) // the physical ? / key, so it fires on any layout
    else if (e.key === 'Escape' && open) set(false) // Escape closes the card before it pauses
  })
  paint()
  onLangChange(paint)

  return { toggle: () => set(!open) }
}
