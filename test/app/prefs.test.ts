import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMinimapZoom, setMinimapZoom, getFuelRate, setFuelRate } from '../../src/app/prefs'

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

describe('fuel-rate pref', () => {
  it('defaults to 1 (the base burn) when nothing is saved', () => {
    expect(getFuelRate()).toBe(1)
  })

  it('round-trips a saved multiplier', () => {
    setFuelRate(0.5)
    expect(getFuelRate()).toBe(0.5)
    setFuelRate(1.6)
    expect(getFuelRate()).toBe(1.6)
  })

  it('falls back to 1 on a bad or non-positive value', () => {
    localStorage.setItem('rtc.fuelRate', 'nonsense')
    expect(getFuelRate()).toBe(1)
    localStorage.setItem('rtc.fuelRate', '0')
    expect(getFuelRate()).toBe(1)
    localStorage.setItem('rtc.fuelRate', '-2')
    expect(getFuelRate()).toBe(1)
  })
})
