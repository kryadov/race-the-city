import type { CarInput } from './car'

export class Keyboard {
  private keys = new Set<string>()
  private readonly onDown = (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase())
  private readonly onUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())

  constructor() {
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
  }

  read(): CarInput {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x))
    const throttle = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0)
    const steer = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0)
    return { throttle, steer, brake: has(' ') }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
  }
}
