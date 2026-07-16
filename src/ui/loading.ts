export interface Loading {
  show(msg: string): void
  error(msg: string): void
  hide(): void
}

/** Centered loading overlay with a spinning indicator and a status line. */
export function createLoading(root: HTMLElement): Loading {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'background:rgba(11,14,19,.85);color:#fff;padding:18px 24px;border-radius:12px;' +
    'font-size:15px;pointer-events:none;display:none;max-width:80vw;text-align:center'

  const spinner = document.createElement('div')
  spinner.style.cssText =
    'width:30px;height:30px;margin:0 auto 12px;border-radius:50%;' +
    'border:3px solid rgba(255,255,255,.18);border-top-color:#e63946'
  spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
    duration: 900,
    iterations: Infinity,
  })

  const text = document.createElement('div')

  box.append(spinner, text)
  root.appendChild(box)

  return {
    show(msg) {
      box.style.display = 'block'
      spinner.style.display = 'block'
      text.style.color = '#fff'
      text.textContent = msg
    },
    error(msg) {
      box.style.display = 'block'
      spinner.style.display = 'none' // an error isn't loading — drop the spinner
      text.style.color = '#ff8080'
      text.textContent = msg
    },
    hide() {
      box.style.display = 'none'
    },
  }
}
