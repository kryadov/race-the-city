import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMinimapZoom, setMinimapZoom } from '../../src/app/prefs'

// The test env is 'node' (no DOM), so stand up a tiny in-memory localStorage.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

describe('minimap zoom pref', () => {
  it('defaults to the middle step when nothing is saved', () => {
    expect(getMinimapZoom()).toBe(2)
  })

  it('round-trips a saved level', () => {
    setMinimapZoom(0)
    expect(getMinimapZoom()).toBe(0)
    setMinimapZoom(4)
    expect(getMinimapZoom()).toBe(4)
  })

  it('falls back to the default on a bad value', () => {
    localStorage.setItem('rtc.minimapZoom', 'nonsense')
    expect(getMinimapZoom()).toBe(2)
    localStorage.setItem('rtc.minimapZoom', '-1')
    expect(getMinimapZoom()).toBe(2)
  })
})
