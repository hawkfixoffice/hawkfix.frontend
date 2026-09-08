import type { Chain, Group, Locale, PageRec, Photo, PriceItem, Settings } from '../lib/types'
import { LOCALES } from '../lib/types'

import indexJson from '../../content/index.json'
import itemsJson from '../../content/items.json'
import chainsJson from '../../content/chains.json'
import groupsJson from '../../content/groups.json'
import settingsJson from '../../content/settings.json'
import photosJson from '../../content/photos.json'
import groupWordsJson from '../../content/group-words.json'

export const allPages = indexJson as unknown as PageRec[]
export const pages = allPages.filter((p) => p.type !== 'service')
export const services = allPages.filter((p) => p.type === 'service')
export const items = itemsJson as unknown as PriceItem[]
export const chains = chainsJson as unknown as Chain[]
export const groups = groupsJson as unknown as Group[]
export const settings = settingsJson as unknown as Settings
export const photos = photosJson as unknown as Record<string, Photo>
/** Синонимы для поиска по прайсу: группа → язык → текст страницы услуги. */
export const groupWords = groupWordsJson as unknown as Record<string, Partial<Record<Locale, string>>>

/** Все 140 маршрутов: путь → (страница, язык). Строится один раз на модуле. */
export interface RouteRec { path: string; page: PageRec; locale: Locale }

export const routes: RouteRec[] = allPages.flatMap((page) =>
  LOCALES.filter((l) => page.paths[l]).map((locale) => ({
    path: page.paths[locale],
    page,
    locale,
  })),
)

export const routeByPath = new Map(routes.map((r) => [r.path, r]))

export function pageByKey(key: string): PageRec | undefined {
  return allPages.find((p) => p.key === key)
}

/** Ключевые страницы — на них ссылаются шапка, подвал и хлебные крошки. */
export const KEY_PAGES = {
  home: 'home',
  services: 'uslugi',
  prices: 'cennik',
  about: 'o-nas',
  contact: 'kontakt',
  privacy: 'polityka-prywatnosci',
  cookies: 'polityka-cookies',
  terms: 'regulamin',
} as const

export function pathOf(key: string, locale: Locale): string {
  return pageByKey(key)?.paths[locale] ?? '/'
}

/** Цены позиций одинаковы во всех языках — берём общий справочник. */
export const itemsByGroup = groups.map((g) => ({
  ...g,
  items: items.filter((i) => i.group === g.key),
}))

export const cheapestOf = (groupKey: string): number =>
  Math.min(...items.filter((i) => i.group === groupKey).map((i) => i.price))
