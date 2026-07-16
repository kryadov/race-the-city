import { describe, it, expect } from 'vitest'
import { t, setLang, getLang, onLangChange } from '../../src/i18n/i18n'

describe('i18n', () => {
  it('translates a key per language', () => {
    setLang('en')
    expect(t('input.go')).toBe('Go')
    expect(t('loading.geocoding')).toBe('Finding city…')
    setLang('ru')
    expect(t('input.go')).toBe('Поехали')
    expect(t('loading.geocoding')).toBe('Ищу город…')
  })

  it('falls back to the key when a translation is missing', () => {
    setLang('en')
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('getLang reflects setLang', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    setLang('ru')
    expect(getLang()).toBe('ru')
  })

  it('notifies subscribers on a real change', () => {
    let got = ''
    onLangChange((l) => {
      got = l
    })
    setLang('en')
    setLang('ru')
    expect(got).toBe('ru')
  })
})
