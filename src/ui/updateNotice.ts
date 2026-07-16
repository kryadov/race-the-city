import { t, onLangChange } from '../i18n/i18n'

export interface UpdateNotice {
  show(version: string): void
}

/**
 * A small bar offering to reload when a newer build has been deployed.
 * Dismissible, and never shown twice for the same version.
 */
export function createUpdateNotice(root: HTMLElement): UpdateNotice {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);pointer-events:auto;display:none;' +
    'align-items:center;gap:10px;background:rgba(11,14,19,.94);color:#fff;padding:9px 12px;' +
    'border-radius:10px;font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)'

  const text = document.createElement('span')
  const reload = document.createElement('button')
  reload.style.cssText = 'padding:6px 10px;border:0;border-radius:6px;background:#e63946;color:#fff;cursor:pointer;font-size:13px'
  reload.addEventListener('click', () => location.reload())
  const close = document.createElement('button')
  close.textContent = '✕'
  close.style.cssText = 'padding:6px 8px;border:0;border-radius:6px;background:#26303f;color:#fff;cursor:pointer;font-size:12px'
  close.addEventListener('click', () => (bar.style.display = 'none'))

  bar.append(text, reload, close)
  root.appendChild(bar)

  const paint = (): void => {
    text.textContent = t('update.available')
    reload.textContent = t('update.reload')
  }
  paint()
  onLangChange(paint)

  return {
    show() {
      paint()
      bar.style.display = 'flex'
    },
  }
}
