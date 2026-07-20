import { describe, it, expect } from 'vitest'
import { readInput, hotkeyFor } from '../../src/vehicle/input'

describe('driving input by physical key code', () => {
  it('drives on WASD by position, so it works on any keyboard layout', () => {
    expect(readInput(new Set(['KeyW']))).toEqual({ throttle: 1, steer: 0, brake: false })
    expect(readInput(new Set(['KeyS']))).toEqual({ throttle: -1, steer: 0, brake: false })
    expect(readInput(new Set(['KeyD']))).toEqual({ throttle: 0, steer: 1, brake: false })
    expect(readInput(new Set(['KeyA']))).toEqual({ throttle: 0, steer: -1, brake: false })
  })

  it('drives on the arrow keys too', () => {
    expect(readInput(new Set(['ArrowUp'])).throttle).toBe(1)
    expect(readInput(new Set(['ArrowDown'])).throttle).toBe(-1)
    expect(readInput(new Set(['ArrowRight'])).steer).toBe(1)
    expect(readInput(new Set(['ArrowLeft'])).steer).toBe(-1)
  })

  it('brakes on Space', () => {
    expect(readInput(new Set(['Space'])).brake).toBe(true)
    expect(readInput(new Set(['KeyW'])).brake).toBe(false)
  })

  it('cancels opposite keys held together', () => {
    expect(readInput(new Set(['KeyW', 'KeyS'])).throttle).toBe(0)
    expect(readInput(new Set(['KeyA', 'KeyD'])).steer).toBe(0)
  })

  it('ignores the characters a layout would produce — it reads codes, not keys', () => {
    // The Cyrillic W-position yields 'ц'; we key off 'KeyW' in the code set, never the char.
    expect(readInput(new Set(['ц', 'w', 'a']))).toEqual({ throttle: 0, steer: 0, brake: false })
  })
})

describe('hotkeys by physical key code', () => {
  it('maps the horn, neon and zoom keys', () => {
    expect(hotkeyFor('KeyH')).toBe('horn')
    expect(hotkeyFor('KeyV')).toBe('neon')
    expect(hotkeyFor('Equal')).toBe('zoomIn')
    expect(hotkeyFor('NumpadAdd')).toBe('zoomIn')
    expect(hotkeyFor('Minus')).toBe('zoomOut')
    expect(hotkeyFor('NumpadSubtract')).toBe('zoomOut')
  })

  it('ignores other keys, and the layout characters H/V would produce', () => {
    expect(hotkeyFor('KeyG')).toBeNull()
    expect(hotkeyFor('р')).toBeNull() // Cyrillic char never reaches here — we pass e.code
    expect(hotkeyFor('h')).toBeNull()
  })
})
