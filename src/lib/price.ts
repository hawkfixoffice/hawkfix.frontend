import type { Locale, PriceItem, PriceType, Settings } from './types'

/** Подпись типа цены — короткая, для бейджа у позиции. */
export const PTYPE_LABEL: Record<PriceType, Record<Locale, string>> = {
  fixed: { pl: 'Stała cena', uk: 'Фіксована ціна', ru: 'Фиксированная цена', en: 'Fixed price' },
  area: { pl: 'Cena za m²', uk: 'Ціна за м²', ru: 'Цена за м²', en: 'Price per m²' },
  scope: { pl: 'Wycena po zdjęciu', uk: 'Оцінка за фото', ru: 'Оценка по фото', en: 'Priced from a photo' },
}

const FROM: Record<Locale, string> = { pl: 'od', uk: 'від', ru: 'от', en: 'from' }
const BY_PHOTO: Record<Locale, string> = { pl: 'wycena', uk: 'оцінка', ru: 'оценка', en: 'quote' }

export const ptypeOf = (i: PriceItem): PriceType => i.ptype ?? 'fixed'

/** Цена позиции так, как её видит клиент:
 *  fixed — «220 zł», area — «45 zł / m²», scope — «od 120 zł» или «wycena». */
export function priceText(i: PriceItem, locale: Locale, s: Settings): { main: string; unit?: string } {
  const unit = s.units[locale]?.[i.unit] ?? i.unit
  if (ptypeOf(i) === 'scope') {
    return i.price > 0
      ? { main: `${FROM[locale]} ${i.price} ${s.currency}`, unit }
      : { main: BY_PHOTO[locale] }
  }
  return { main: `${i.price} ${s.currency}`, unit }
}

export const fromWord = (l: Locale) => FROM[l]

/** Название на языке страницы; у новой позиции может быть только польское. */
export const nameOf = (i: { name: Partial<Record<Locale, string>> }, l: Locale): string =>
  i.name[l] || i.name.pl || Object.values(i.name).find(Boolean) || ''

/** «от N zł» по группе: позиции «по фото» без цены в минимум не берём. */
export function minPrice(list: PriceItem[]): number {
  const priced = list.map((i) => i.price).filter((p) => p > 0)
  return priced.length ? Math.min(...priced) : 0
}

/** Позиции группы по подкатегориям; без подкатегории — в конце, без заголовка. */
export function bySub<T extends PriceItem>(list: T[], subs: { key: string; name: Partial<Record<Locale, string>> }[]) {
  const parts: { key: string; name: Partial<Record<Locale, string>> | null; list: T[] }[] = subs
    .map((sg) => ({ key: sg.key, name: sg.name, list: list.filter((i) => i.sub === sg.key) }))
    .filter((p) => p.list.length)
  const rest = list.filter((i) => !i.sub || !subs.some((sg) => sg.key === i.sub))
  if (rest.length) parts.push({ key: '', name: null, list: rest })
  return parts
}
