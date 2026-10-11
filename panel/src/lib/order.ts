import { sb } from './supabase'
import type { Lang } from './i18n'

/** Строка сметы в форме заказа: позиция прайса (key) или своя строка. */
export interface Line {
  key?: string
  name: string
  qty: number
  /** Цена за единицу: у позиции прайса — из прайса или прежняя цена заказа */
  price: number
  ptype?: string
  dept?: string
}

export interface CatItem {
  key: string; group: string; dept?: string; price: number; unit?: string
  ptype?: string; name: Record<string, string>
}
export interface Catalog {
  groups: { key: string; name: Record<string, string> }[]
  items: CatItem[]
}

export interface CalcSettings {
  minVisit: number; minVisitBy: Record<string, number>; urgentPct: number; urgentMax: number
}

/** Шесть двухчасовых окон — те же, что выбирает клиент на сайте. */
export const SLOTS = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00', '18:00-20:00']

export const nameOf = (n: Record<string, string> | undefined, lang: Lang) =>
  n?.[lang] ?? n?.pl ?? ''

let cache: Promise<{ catalog: Catalog; settings: CalcSettings }> | null = null

/** Прайс и правила расчёта. Берём живые, тем же вызовом, что и сайт. */
export function loadPricing() {
  cache ??= Promise.all([
    sb.rpc('catalog'),
    sb.from('settings').select('key, value').in('key', ['minVisit', 'minVisitBy', 'urgentPct', 'urgentMax']),
  ]).then(([c, s]) => {
    if (c.error) { cache = null; throw c.error }
    const v = Object.fromEntries((s.data ?? []).map((r: any) => [r.key, r.value]))
    return {
      catalog: (c.data ?? { groups: [], items: [] }) as Catalog,
      settings: {
        minVisit: Number(v.minVisit ?? 0), minVisitBy: v.minVisitBy ?? {},
        urgentPct: Number(v.urgentPct ?? 50), urgentMax: Number(v.urgentMax ?? 300),
      },
    }
  })
  return cache
}

export interface Preview { labour: number; minimum: number; minApplied: boolean; urgentFee: number; total: number; hasScope: boolean }

/** Предварительный итог в форме. Правила те же, что у калькулятора сайта
 *  и у сервера (order_totals); настоящую сумму всё равно считает сервер. */
export function preview(lines: Line[], s: CalcSettings, urgent: boolean, applyMin: boolean): Preview {
  const labour = lines.reduce((a, l) => a + l.price * l.qty, 0)
  const depts = [...new Set(lines.filter((l) => l.key && l.dept).map((l) => l.dept as string))]
  const keyed = lines.some((l) => l.key)
  const minimum = applyMin && keyed
    ? Math.max(...(depts.length ? depts.map((d) => s.minVisitBy[d] ?? s.minVisit) : [s.minVisit]))
    : 0
  const base = lines.length ? Math.max(labour, minimum) : 0
  const urgentFee = urgent && base > 0 ? Math.min(Math.round(base * s.urgentPct / 100), s.urgentMax) : 0
  return {
    labour, minimum, minApplied: lines.length > 0 && minimum > labour, urgentFee,
    total: base + urgentFee, hasScope: lines.some((l) => l.ptype === 'scope'),
  }
}

/** Строки формы → то, что ждёт сервер: {key, qty} или {name, price, qty}. */
export const toPayload = (lines: Line[]) =>
  lines.map((l) => (l.key ? { key: l.key, qty: l.qty } : { name: l.name.trim(), price: l.price, qty: l.qty }))

/** Строки уже существующего заказа → строки формы. */
export function fromOrder(items: any[], catalog: Catalog): Line[] {
  const byKey = new Map(catalog.items.map((i) => [i.key, i]))
  return (items ?? []).map((i: any) => {
    const qty = Number(i.qty) || 1
    return {
      key: i.key || undefined,
      name: String(i.name ?? ''),
      qty,
      price: i.key ? Math.round((Number(i.sum) || 0) / qty * 100) / 100 : Number(i.price ?? (Number(i.sum) || 0) / qty),
      ptype: i.ptype ?? byKey.get(i.key)?.ptype,
      dept: byKey.get(i.key)?.dept,
    }
  })
}
