import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMenuButton } from '../../src/ui/menuButton'
import { cornerRight } from '../../src/ui/cornerButtons'

// Minimal DOM stub (the project runs vitest under `node`, no jsdom) — just enough
// of Element for the one button createMenuButton builds and the click we fire.
class El {
  tagName: string
  children: El[] = []
  style: Record<string, string> = { cssText: '' }
  dataset: Record<string, string> = {}
  textContent = ''
  title = ''
  private listeners: Record<string, Array<() => void>> = {}
  constructor(tag: string) {
    this.tagName = tag.toUpperCase()
  }
  appendChild(c: El): El {
    this.children.push(c)
    return c
  }
  addEventListener(type: string, fn: () => void): void {
    ;(this.listeners[type] ||= []).push(fn)
  }
  click(): void {
    for (const fn of this.listeners.click || []) fn()
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => new El(tag),
  }
})

describe('createMenuButton', () => {
  it('opens the menu when clicked — the touch way in, with no Esc key', () => {
    const root = new El('div')
    const onOpen = vi.fn()
    createMenuButton(root as unknown as HTMLElement, onOpen)

    const btn = root.children.find((c) => c.dataset.role === 'openMenu')!
    expect(btn).toBeDefined()
    expect(btn.textContent).toBe('☰')
    btn.click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('sits in slot 2 of the corner row, after pause and help', () => {
    const root = new El('div')
    createMenuButton(root as unknown as HTMLElement, () => {})
    const btn = root.children.find((c) => c.dataset.role === 'openMenu')!
    // its right offset is the third slot — clear of pause (0) and help (1)
    expect(btn.style.cssText).toContain(`right:${cornerRight(2)}px`)
  })
})
