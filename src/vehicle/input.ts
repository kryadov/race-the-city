import type { CarInput } from './car'

/**
 * Physical-key driving input, read once per frame.
 *
 * Keys are matched by `KeyboardEvent.code` (the physical position) rather than
 * `.key` (the character the layout produces). On a Cyrillic or AZERTY keyboard
 * `.key` for the W position is not `'w'`, so WASD silently did nothing and only
 * the arrow keys drove. By position, WASD works on every layout.
 */
export class Keyboard {
  private codes = new Set<string>()
  private readonly onDown = (e: KeyboardEvent) => this.codes.add(e.code)
  private readonly onUp = (e: KeyboardEvent) => this.codes.delete(e.code)

  constructor() {
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
  }

  read(): CarInput {
    return readInput(this.codes)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
  }
}

/**
 * Map the set of currently-held physical key codes to a car input. Pure, so it's
 * unit-testable without a DOM. WASD (by physical position) or the arrow keys steer
 * and drive; Space brakes.
 */
export function readInput(codes: ReadonlySet<string>): CarInput {
  const has = (...k: string[]): boolean => k.some((x) => codes.has(x))
  const throttle = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0)
  const steer = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0)
  return { throttle, steer, brake: has('Space') }
}

/** A single-press hotkey the game reacts to, identified by physical key code. */
export type Hotkey = 'horn' | 'neon' | 'zoomIn' | 'zoomOut'

/**
 * Which hotkey a physical key code triggers, or null. By `code` so it fires on any
 * layout — the horn (H) was matched on `.key` and never fired on a Cyrillic layout.
 * `+`/`-` come off the same physical keys as `=`/`_`, and the numpad pair too.
 */
export function hotkeyFor(code: string): Hotkey | null {
  switch (code) {
    case 'KeyH':
      return 'horn'
    case 'KeyV':
      return 'neon'
    case 'Equal':
    case 'NumpadAdd':
      return 'zoomIn'
    case 'Minus':
    case 'NumpadSubtract':
      return 'zoomOut'
    default:
      return null
  }
}
