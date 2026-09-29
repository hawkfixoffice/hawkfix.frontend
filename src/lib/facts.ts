import type { Locale, PageRec } from './types'
import { items, services, settings } from '../data/content'
import { CONTACT, UI } from './ui'
import { fill } from './ui-extra'

/** Числа для блока «коротко» — берутся из прайса и настроек, не вписаны руками. */
export function factVars(): Record<string, string | number> {
  return {
    min: settings.minVisit,
    n: items.length,
    s: services.length,
    km: CONTACT.radiusKm,
    pct: settings.urgentPct,
    max: settings.urgentMax,
  }
}

/** Короткое имя услуги: «Hydraulika — drobne naprawy» → «Hydraulika». */
export const shortName = (h1: string) => h1.split(' — ')[0].trim()

/** Имя внутри вопроса со строчной буквы; аббревиатуры (AGD, LED) не трогаем. */
const inSentence = (s: string) =>
  /^\p{Lu}\p{Lu}/u.test(s) ? s : s.charAt(0).toLocaleLowerCase() + s.slice(1)

export function priceFromOf(page: PageRec): number {
  const list = page.group ? items.filter((i) => i.group === page.group && i.price > 0) : []
  return list.length ? Math.min(...list.map((i) => i.price)) : settings.minVisit
}

/**
 * Вопросы и ответы страницы услуги. Один источник и для видимого блока,
 * и для FAQPage в JSON-LD: разметка обязана совпадать с тем, что на странице.
 * Все цифры — из прайса и настроек.
 */
export function serviceFaq(page: PageRec, locale: Locale): { q: string; a: string }[] {
  const t = UI[locale].sfaq
  const name = shortName(page.tr[locale].h1)
  const vars = { ...factVars(), from: priceFromOf(page) }
  const hasList = !!page.group && items.some((i) => i.group === page.group)
  const price = { q: t.price.q, a: hasList ? t.price.a : t.price.aNoList }
  return [price, t.when, t.area, t.order].map((x) => ({
    q: fill(x.q, { ...vars, name: inSentence(name) }),
    a: fill(x.a, { ...vars, name }),
  }))
}
