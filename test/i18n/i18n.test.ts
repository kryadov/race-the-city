import { describe, it, expect } from 'vitest'
import { t, setLang, getLang, onLangChange, LANGS } from '../../src/i18n/i18n'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('i18n', () => {
  it('translates a key per language', () => {
    setLang('en')
    expect(t('input.go')).toBe('Go')
    expect(t('loading.geocoding')).toBe('Finding city…')
    setLang('ru')
    expect(t('input.go')).toBe('Поехали')
    expect(t('loading.geocoding')).toBe('Ищу город…')
  })

  it('localises the start-menu title in every language', () => {
    setLang('en')
    expect(t('start.title')).toBe('RACE THE CITY')
    setLang('ru')
    expect(t('start.title')).toBe('МЧИСЬ ПО ГОРОДУ')
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

  it('labels every vehicle and group in every language', () => {
    for (const lang of LANGS) {
      setLang(lang)
      for (const key of [
        ...VEHICLE_TYPES.map((v) => 'vehicle.' + v),
        'vehGroup.cars', 'vehGroup.trucks', 'vehGroup.special', 'vehGroup.exotic',
      ]) {
        expect(t(key), `${lang}/${key}`).not.toBe(key) // key echoed back = translation missing
      }
    }
  })
})
