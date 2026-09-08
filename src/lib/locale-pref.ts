import { LOCALES, type Locale } from './types'

const PREF_KEY = 'hawkfix.lang'        // явный выбор пользователя — главнее всего
const SESSION_KEY = 'hawkfix.langChecked'

export function readPref(): Locale | null {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return LOCALES.includes(v as Locale) ? (v as Locale) : null
  } catch { return null }
}

export function savePref(l: Locale) {
  try { localStorage.setItem(PREF_KEY, l) } catch { /* хранилище недоступно */ }
}

/** Язык устройства → наш локаль. Берём первый подходящий из navigator.languages. */
export function detectLocale(): Locale | null {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of langs) {
    const code = (raw || '').toLowerCase().split('-')[0]
    if (LOCALES.includes(code as Locale)) return code as Locale
  }
  return null
}

/** Ботам и headless-рендерерам язык не подменяем: Google рендерит с en-US,
 *  и автопереход с / на /en/ ломал бы индексацию. hreflang решает это сам. */
export function isBot(): boolean {
  if (navigator.webdriver) return true
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|lighthouse|headless/i.test(navigator.userAgent)
}

/** Один раз за сессию: чтобы «назад» на / не отбрасывало снова. */
export function onceThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false
    sessionStorage.setItem(SESSION_KEY, '1')
    return true
  } catch { return true }
}
