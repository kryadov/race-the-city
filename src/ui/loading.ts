export interface Loading {
  /** Show a status line; pass a 0..1 fraction to also show a percentage bar. */
  show(msg: string, frac?: number): void
  error(msg: string): void
  hide(): void
  /**
   * Show a Cancel button on the overlay wired to `onCancel`, or hide it when
   * called with `null`. Stays put across `show()` calls; `hide`/`error` clear it.
   */
  setCancel(label: string | null, onCancel?: () => void): void
}

/** Centered loading overlay with a spinning indicator and a status line. */
export function createLoading(root: HTMLElement): Loading {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'background:rgba(11,14,19,.85);color:#fff;padding:18px 24px;border-radius:12px;' +
    'font-size:15px;pointer-events:none;display:none;max-width:80vw;text-align:center;z-index:55'

  const spinner = document.createElement('div')
  spinner.style.cssText =
    'width:30px;height:30px;margin:0 auto 12px;border-radius:50%;' +
    'border:3px solid rgba(255,255,255,.18);border-top-color:#e63946'
  spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
    duration: 900,
    iterations: Infinity,
  })

  const text = document.createElement('div')

  const barTrack = document.createElement('div')
  barTrack.style.cssText =
    'width:180px;height:6px;margin:12px auto 2px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden'
  const barFill = document.createElement('div')
  barFill.style.cssText = 'height:100%;width:0%;background:#e63946;border-radius:3px;transition:width .2s ease'
  barTrack.appendChild(barFill)
  const pct = document.createElement('div')
  pct.style.cssText = 'font-size:12px;opacity:.7;margin-top:4px'

  // The box itself is click-through (pointer-events:none), so the button opts
  // back in with pointer-events:auto to catch the click.
  const cancelBtn = document.createElement('button')
  cancelBtn.style.cssText =
    'display:none;margin:14px auto 0;padding:6px 16px;border:0;border-radius:6px;cursor:pointer;' +
    'pointer-events:auto;font-size:13px;color:#fff;background:rgba(255,255,255,.14)'

  box.append(spinner, text, barTrack, pct, cancelBtn)
  root.appendChild(box)

  return {
    show(msg, frac) {
      box.style.display = 'block'
      spinner.style.display = 'block'
      text.style.color = '#fff'
      text.textContent = msg
      const hasBar = frac !== undefined
      barTrack.style.display = hasBar ? 'block' : 'none'
      pct.style.display = hasBar ? 'block' : 'none'
      if (hasBar) {
        const p = Math.round(Math.max(0, Math.min(1, frac)) * 100)
        barFill.style.width = p + '%'
        pct.textContent = p + '%'
      }
    },
    error(msg) {
      box.style.display = 'block'
      spinner.style.display = 'none' // an error isn't loading — drop the spinner
      barTrack.style.display = 'none'
      pct.style.display = 'none'
      cancelBtn.style.display = 'none' // nothing left to cancel
      text.style.color = '#ff8080'
      text.textContent = msg
    },
    hide() {
      box.style.display = 'none'
      cancelBtn.style.display = 'none'
    },
    setCancel(label, onCancel) {
      if (label === null || !onCancel) {
        cancelBtn.style.display = 'none'
        cancelBtn.onclick = null
        return
      }
      cancelBtn.textContent = label
      cancelBtn.onclick = onCancel
      cancelBtn.style.display = 'block'
    },
  }
}
