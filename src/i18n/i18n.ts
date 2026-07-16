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
    'loading.build': 'Building the city…',
    'error.cityNotFound': 'City not found — try another.',
    'error.loadFailed': 'Failed to load the city.',
    'vehicle.car': 'Car',
    'vehicle.truck': 'Truck',
    'vehicle.sports': 'Sports',
    'vehicle.motorbike': 'Bike',
    'vehicle.bus': 'Bus',
    'vehicle.racecar': 'Race car',
    'vehicle.tractor': 'Tractor',
    'vehicle.lorry': 'Lorry',
    'vehicle.cabrio': 'Cabrio',
    'menu.title': 'Settings',
    'menu.city': 'City',
    'menu.setDefault': 'Set as default',
    'menu.share': 'Copy link',
    'menu.shared': 'Link copied!',
    'menu.random': 'Random city',
    'menu.language': 'Language',
    'menu.view': 'View',
    'menu.vehicle': 'Vehicle',
    'menu.audio': 'Audio',
    'menu.sound': 'Sound',
    'menu.music': 'Music',
    'menu.customTrack': 'Own track…',
    'menu.builtinTrack': 'Back to built-in music',
    'menu.roadLabels': 'Street names',
    'menu.map': 'Map',
    'menu.time': 'Time of day',
    'menu.zoom': 'Zoom',
    'menu.driftFx': 'Drift effects',
    'menu.hud': 'Dashboard',
    'menu.shadows': 'Shadows',
    'menu.weather': 'Weather',
    'menu.clouds': 'Clouds',
    'menu.roadDetail': 'Lamps & signs',
    'menu.nitro': 'Nitro pickups',
    'menu.reset': 'Reset settings',
    'weather.auto': 'Auto',
    'weather.clear': 'Clear',
    'weather.rain': 'Rain',
    'weather.snow': 'Snow',
    'weather.fog': 'Fog',
    'hud.kmh': 'km/h',
    'update.available': 'A new version is available',
    'update.reload': 'Reload',
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
    'loading.build': 'Строю город…',
    'error.cityNotFound': 'Город не найден — попробуй другой.',
    'error.loadFailed': 'Не удалось загрузить город.',
    'vehicle.car': 'Легковая',
    'vehicle.truck': 'Грузовик',
    'vehicle.sports': 'Спорткар',
    'vehicle.motorbike': 'Мотоцикл',
    'vehicle.bus': 'Автобус',
    'vehicle.racecar': 'Гоночная',
    'vehicle.tractor': 'Трактор',
    'vehicle.lorry': 'Фура',
    'vehicle.cabrio': 'Кабриолет',
    'menu.title': 'Настройки',
    'menu.city': 'Город',
    'menu.setDefault': 'Сделать стартовым',
    'menu.share': 'Скопировать ссылку',
    'menu.shared': 'Ссылка скопирована!',
    'menu.random': 'Случайный город',
    'menu.language': 'Язык',
    'menu.view': 'Вид',
    'menu.vehicle': 'Машина',
    'menu.audio': 'Звук',
    'menu.sound': 'Звуки',
    'menu.music': 'Музыка',
    'menu.customTrack': 'Свой трек…',
    'menu.builtinTrack': 'Вернуть встроенную музыку',
    'menu.roadLabels': 'Названия улиц',
    'menu.map': 'Карта',
    'menu.time': 'Время суток',
    'menu.zoom': 'Зум',
    'menu.driftFx': 'Эффекты дрифта',
    'menu.hud': 'Панель',
    'menu.shadows': 'Тени',
    'menu.weather': 'Погода',
    'menu.clouds': 'Облака',
    'menu.roadDetail': 'Фонари и знаки',
    'menu.nitro': 'Нитро-бонусы',
    'menu.reset': 'Сбросить настройки',
    'weather.auto': 'Авто',
    'weather.clear': 'Ясно',
    'weather.rain': 'Дождь',
    'weather.snow': 'Снег',
    'weather.fog': 'Туман',
    'hud.kmh': 'км/ч',
    'update.available': 'Доступна новая версия',
    'update.reload': 'Обновить',
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
