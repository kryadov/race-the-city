import type { ViewMode } from '../app/theme'
import { t, getLang, setLang, onLangChange, LANGS } from '../i18n/i18n'

export interface CityInputHandle {
  /** Reflect the current view mode on the toggle button. */
  setViewMode(mode: ViewMode): void
}

export function createCityInput(
  root: HTMLElement,
  onSubmit: (query: string) => void,
  onToggleView: () => void,
): CityInputHandle {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:8px;pointer-events:auto;background:rgba(11,14,19,.8);' +
    'padding:8px;border-radius:10px'

  const input = document.createElement('input')
  input.placeholder = t('input.placeholder')
  input.value = 'Monte Carlo'
  input.style.cssText = 'padding:8px 10px;border:0;border-radius:6px;font-size:14px;width:220px'

  const btn = document.createElement('button')
  btn.textContent = t('input.go')
  btn.style.cssText =
    'padding:8px 14px;border:0;border-radius:6px;background:#e63946;color:#fff;font-size:14px;cursor:pointer'

  const secondary = 'padding:8px 12px;border:0;border-radius:6px;background:#26303f;color:#fff;font-size:14px;cursor:pointer'

  const viewBtn = document.createElement('button')
  viewBtn.title = t('view.title')
  viewBtn.style.cssText = secondary
  let currentMode: ViewMode = 'day'
  const setViewMode = (mode: ViewMode): void => {
    currentMode = mode
    viewBtn.textContent = mode === 'neon' ? t('view.neon') : t('view.day')
  }
  setViewMode('day')

  const langBtn = document.createElement('button')
  langBtn.title = t('lang.title')
  langBtn.style.cssText = secondary
  const renderLang = (): void => {
    langBtn.textContent = getLang().toUpperCase()
  }
  renderLang()
  langBtn.addEventListener('click', () => {
    const i = LANGS.indexOf(getLang())
    setLang(LANGS[(i + 1) % LANGS.length])
  })

  const go = (): void => {
    if (input.value.trim()) onSubmit(input.value.trim())
  }
  btn.addEventListener('click', go)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go()
  })
  viewBtn.addEventListener('click', onToggleView)

  bar.append(input, btn, viewBtn, langBtn)
  root.appendChild(bar)

  onLangChange(() => {
    input.placeholder = t('input.placeholder')
    btn.textContent = t('input.go')
    viewBtn.title = t('view.title')
    setViewMode(currentMode) // refresh the day/neon label in the new language
    langBtn.title = t('lang.title')
    renderLang()
  })

  return { setViewMode }
}
