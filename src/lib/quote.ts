import type { Chain, Locale, PriceItem, Settings } from './types'

export interface Selection { key: string; qty: number }

export interface QuoteLine {
  item: PriceItem
  qty: number
  sum: number
  hours: number
}

export interface Quote {
  lines: QuoteLine[]
  labour: number          // сумма работ как есть
  minimum: number         // минимум выезда, применимый к выбранным направлениям
  minimumApplied: boolean // сработал ли минимум (важно показать честно)
  base: number            // max(labour, minimum)
  urgentFee: number
  total: number
  hours: number
  count: number           // сколько позиций выбрано (с учётом количеств)
}

/**
 * Расчёт сметы. Правила перенесены со старого сайта:
 *  — минимум выезда зависит от направления работ (ремонт/уборка/переезд/сад);
 *  — дорога добирает работы до минимума, а не приплюсовывается сверху;
 *  — срочность +N %, но не больше потолка в злотых.
 */
export function calcQuote(
  selection: Selection[],
  items: PriceItem[],
  settings: Settings,
  urgent: boolean,
): Quote {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const lines: QuoteLine[] = []

  for (const s of selection) {
    const item = byKey.get(s.key)
    if (!item || s.qty <= 0) continue
    lines.push({ item, qty: s.qty, sum: item.price * s.qty, hours: item.hours * s.qty })
  }

  const labour = lines.reduce((a, l) => a + l.sum, 0)
  const hours = lines.reduce((a, l) => a + l.hours, 0)

  // Минимум берём как максимальный среди направлений, которые реально выбраны
  const depts = new Set(lines.map((l) => l.item.dept).filter(Boolean))
  const minimum = depts.size
    ? Math.max(...[...depts].map((d) => settings.minVisitBy[d] ?? settings.minVisit))
    : 0

  const base = lines.length ? Math.max(labour, minimum) : 0
  const minimumApplied = lines.length > 0 && minimum > labour

  const urgentFee = urgent && base > 0
    ? Math.min(Math.round((base * settings.urgentPct) / 100), settings.urgentMax)
    : 0

  return {
    lines, labour, minimum, minimumApplied, base, urgentFee,
    total: base + urgentFee, hours,
    count: lines.reduce((a, l) => a + l.qty, 0),
  }
}

/** Цепочки: выбрал работу — предлагаем недостающие шаги того же цикла. */
export function suggestedChains(selection: Selection[], chains: Chain[]): { chain: Chain; missing: string[] }[] {
  const chosen = new Set(selection.filter((s) => s.qty > 0).map((s) => s.key))
  return chains
    .filter((c) => c.trigger.some((t) => chosen.has(t)))
    .map((c) => ({ chain: c, missing: c.steps.filter((s) => !chosen.has(s)) }))
    .filter((x) => x.missing.length > 0)
}

export function formatMoney(n: number, settings: Settings, locale: Locale): string {
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale === 'pl' ? 'pl-PL' : locale === 'uk' ? 'uk-UA' : 'ru-RU', {
    maximumFractionDigits: 0,
  })
  return `${nf.format(Math.round(n))} ${settings.currency}`
}

export function formatHours(h: number, locale: Locale): string {
  if (h <= 0) return '—'
  const rounded = Math.round(h * 10) / 10
  const unit = locale === 'pl' ? 'godz.' : locale === 'en' ? 'h' : 'ч'
  return `${String(rounded).replace('.', locale === 'en' ? '.' : ',')} ${unit}`
}
