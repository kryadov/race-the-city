import { describe, it, expect } from 'vitest'
import { t, setLang, getLang, onLangChange, LANGS, messageKeys } from '../../src/i18n/i18n'
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
    // Every shipped language gives the title its own, non-English wording.
    for (const lang of LANGS) {
      setLang(lang)
      const title = t('start.title')
      expect(title, `${lang}/start.title`).not.toBe('start.title') // not the raw key
      if (lang !== 'en') expect(title, `${lang}/start.title`).not.toBe('RACE THE CITY')
    }
  })

  it('ships every language with the exact same set of keys — no gaps, no strays', () => {
    // English is the source of truth; every other language must cover every key it
    // has and add none of its own — a missing key falls back to the raw key and
    // shows in the UI; a stray key is dead weight.
    const enKeys = messageKeys('en').slice().sort()
    expect(enKeys.length).toBeGreaterThan(100) // sanity: the map really is populated
    for (const lang of LANGS) {
      expect(messageKeys(lang).slice().sort(), `${lang} key set`).toEqual(enKeys)
    }
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

  it('ships the five added scripts, each genuinely translated (not English)', () => {
    // Armenian, Georgian, Japanese, Korean, Chinese — all present in LANGS and
    // carrying their own wording, not an English echo, for a spread of keys.
    const added = ['hy', 'ka', 'ja', 'ko', 'zh'] as const
    for (const lang of added) {
      expect(LANGS, `${lang} in LANGS`).toContain(lang)
      setLang(lang)
      for (const key of ['start.play', 'menu.title', 'weather.snow', 'vehicle.car']) {
        const en = (setLang('en'), t(key))
        setLang(lang)
        const val = t(key)
        expect(val, `${lang}/${key} present`).not.toBe(key) // not the raw key
        expect(val, `${lang}/${key} translated`).not.toBe(en) // not the English word
      }
    }
    setLang('en')
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
