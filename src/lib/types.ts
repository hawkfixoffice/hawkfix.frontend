export type Locale = 'pl' | 'uk' | 'ru' | 'en'
export const LOCALES: Locale[] = ['pl', 'uk', 'ru', 'en']
export const DEFAULT_LOCALE: Locale = 'pl'

/** hreflang, который отдаём в <link rel="alternate">. Совпадает со старым сайтом. */
export const HREFLANG: Record<Locale, string> = {
  pl: 'pl-PL', uk: 'uk-UA', ru: 'ru', en: 'en',
}
/** og:locale */
export const OG_LOCALE: Record<Locale, string> = {
  pl: 'pl_PL', uk: 'uk_UA', ru: 'ru_RU', en: 'en_US',
}
export const LOCALE_NAME: Record<Locale, string> = {
  pl: 'Polski', uk: 'Українська', ru: 'Русский', en: 'English',
}

/** Боевой адрес. */
export const PROD_SITE = 'https://hawkfix.pl'

/**
 * Адрес, от которого строятся canonical, hreflang, og:image и schema.org.
 *
 * Одна сборка живёт ровно на одном адресе: og-разметку читают краулеры
 * из статического HTML, JS они не выполняют, поэтому ссылка на картинку
 * обязана быть абсолютной и вести туда же, где лежит сборка. Отсюда
 * параметр сборки, а не константа:
 *
 *     VITE_SITE=https://hawnfix.barabashflow.pl npm run build
 *
 * Без переменной собирается боевой адрес.
 */
export const SITE = (import.meta.env.VITE_SITE || PROD_SITE).replace(/\/+$/, '')

/** Витрина для проверки. В индекс её пускать нельзя: тот же контент на двух
 *  адресах — это дубль, который отбирает позиции у боевого домена. */
export const IS_STAGING = SITE !== PROD_SITE

export type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; text: string }

/** Лёгкая часть страницы — лежит в index.json и попадает в бандл.
 *  canonical / og:image / og:locale выводятся из пути и языка, не храним. */
export interface PageTr {
  path: string
  title: string
  description: string
  h1: string
  blurb?: string
}

/** Тяжёлое тело страницы — отдельный файл на страницу+язык,
 *  грузится только для открытого маршрута. */
export interface PageBody {
  blocks: Block[]
  checklist?: string[]
  /** Только у услуг: описание до чек-листа и примечание о ценах после него. */
  intro?: string[]
  note?: string[]
}

export type PageType = 'home' | 'services' | 'prices' | 'about' | 'contact' | 'legal' | 'service'

export interface PageRec {
  key: string
  type: PageType
  paths: Record<Locale, string>
  tr: Record<Locale, PageTr>
  image?: string
  group?: string
}

export interface PriceItem {
  key: string; group: string; dept: string
  price: number; hours: number; unit: string
  min: number; max: number
  name: Record<Locale, string>
  a?: string; au?: string; s?: string; su?: string; wet?: number; dry?: number
}

export interface Chain {
  key: string; trigger: string[]; visits: number; minPrice: number
  steps: string[]; name: Record<Locale, string>; unless: Record<Locale, string>
}

export interface Group { key: string; name: Partial<Record<Locale, string>> }

export interface Settings {
  minVisit: number
  minVisitBy: Record<string, number>
  urgentPct: number
  urgentMax: number
  workDays: number[]
  currency: string
  units: Record<Locale, Record<string, string>>
  strings: Record<Locale, Record<string, string>>
}

export interface Photo {
  id: string; alt: string; author: string; link: string; color?: string
}
