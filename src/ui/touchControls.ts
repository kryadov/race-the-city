import type { CarInput } from '../vehicle/car'

export interface TouchControls {
  read(): CarInput
}

const NEUTRAL: CarInput = { throttle: 0, steer: 0, brake: false }

/**
 * On-screen driving buttons for touch devices: steering on the left, throttle
 * and reverse on the right. Each button captures its own pointer so multitouch
 * (steer + accelerate at once) works. No-op on non-touch devices.
 */
export function createTouchControls(root: HTMLElement): TouchControls {
  const isTouch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  if (!isTouch) return { read: () => NEUTRAL }

  const state = { throttle: 0, steer: 0, brake: false }

  const makeButton = (label: string, side: 'left' | 'right', offset: number): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText =
      `position:absolute;bottom:${20}px;${side}:${offset}px;width:82px;height:82px;` +
      'border:0;border-radius:50%;background:rgba(38,48,63,.7);color:#fff;font-size:30px;' +
      'pointer-events:auto;touch-action:none;user-select:none'
    return b
  }

  const bind = (b: HTMLButtonElement, press: () => void, release: () => void): void => {
    const down = (e: PointerEvent): void => {
      e.preventDefault()
      b.setPointerCapture(e.pointerId)
      b.style.background = 'rgba(230,57,70,.75)'
      press()
    }
    const up = (): void => {
      b.style.background = 'rgba(38,48,63,.7)'
      release()
    }
    b.addEventListener('pointerdown', down)
    b.addEventListener('pointerup', up)
    b.addEventListener('pointercancel', up)
    b.addEventListener('pointerleave', up)
  }

  const steerLeft = makeButton('◀', 'left', 20)
  const steerRight = makeButton('▶', 'left', 116)
  const reverse = makeButton('▼', 'right', 116)
  const gas = makeButton('▲', 'right', 20)

  bind(steerLeft, () => (state.steer = -1), () => (state.steer = 0))
  bind(steerRight, () => (state.steer = 1), () => (state.steer = 0))
  bind(gas, () => (state.throttle = 1), () => (state.throttle = 0))
  bind(reverse, () => (state.throttle = -1), () => (state.throttle = 0))

  root.append(steerLeft, steerRight, reverse, gas)

  return { read: () => ({ ...state }) }
}
