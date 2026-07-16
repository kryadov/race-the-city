export type Lang = 'en' | 'ru'
export const LANGS: readonly Lang[] = ['en', 'ru']

type Dict = Record<string, string>

const MESSAGES: Record<Lang, Dict> = {
  en: {
    'input.placeholder': 'City or "lat,lon"',
    'input.go': 'Go',
    'view.day': '☀ Day',
    'view.neon': '🌐 Neon',
    'view.title': 'Toggle view (V key)',
    'lang.title': 'Language',
    'loading.geocoding': 'Finding city…',
    'loading.osm': 'Loading OSM map…',
    'loading.terrain': 'Loading terrain…',
    'error.cityNotFound': 'City not found — try another.',
    'error.loadFailed': 'Failed to load the city.',
    'vehicle.car': 'Car',
    'vehicle.truck': 'Truck',
    'vehicle.sports': 'Sports',
    'menu.title': 'Settings',
    'menu.city': 'City',
    'menu.setDefault': 'Set as default',
    'menu.language': 'Language',
    'menu.view': 'View',
    'menu.vehicle': 'Vehicle',
    'menu.audio': 'Audio',
    'menu.sound': 'Sound',
    'menu.music': 'Music',
    'menu.roadLabels': 'Street names',
    'menu.map': 'Map',
    'menu.time': 'Time of day',
  },
  ru: {
    'input.placeholder': 'Город или "lat,lon"',
    'input.go': 'Поехали',
    'view.day': '☀ День',
    'view.neon': '🌐 Neon',
    'view.title': 'Переключить вид (клавиша V)',
    'lang.title': 'Язык',
    'loading.geocoding': 'Ищу город…',
    'loading.osm': 'Загружаю карту OSM…',
    'loading.terrain': 'Загружаю рельеф…',
    'error.cityNotFound': 'Город не найден — попробуй другой.',
    'error.loadFailed': 'Не удалось загрузить город.',
    'vehicle.car': 'Легковая',
    'vehicle.truck': 'Грузовик',
    'vehicle.sports': 'Спорткар',
    'menu.title': 'Настройки',
    'menu.city': 'Город',
    'menu.setDefault': 'Сделать стартовым',
    'menu.language': 'Язык',
    'menu.view': 'Вид',
    'menu.vehicle': 'Машина',
    'menu.audio': 'Звук',
    'menu.sound': 'Звуки',
    'menu.music': 'Музыка',
    'menu.roadLabels': 'Названия улиц',
    'menu.map': 'Карта',
    'menu.time': 'Время суток',
  },
}

const STORAGE_KEY = 'rtc.lang'
const listeners = new Set<(lang: Lang) => void>()

function detect(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s === 'en' || s === 'ru') return s
  } catch {
    /* no localStorage (e.g. tests) */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) {
      return 'ru'
    }
  } catch {
    /* no navigator */
  }
  return 'en'
}

let current: Lang = detect()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore persistence failures */
  }
  for (const cb of listeners) cb(lang)
}

/** Subscribe to language changes (e.g. to re-render UI text). */
export function onLangChange(cb: (lang: Lang) => void): void {
  listeners.add(cb)
}

/** Translate a key in the current language; unknown keys return the key itself. */
export function t(key: string): string {
  return MESSAGES[current][key] ?? key
}
