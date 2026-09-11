/** Форматирование чисел и дат в панели. Валюта одна — злотый. */
import type { Lang } from './i18n'

const LOCALE: Record<Lang, string> = { pl: 'pl-PL', ru: 'ru-RU', en: 'en-GB' }

/** «1 заказ», «2 заказа», «5 заказов» — числительное согласуется со словом.
 *  В польском и русском форм три, в английском две; Intl знает, какая нужна. */
const ORDERS: Record<Lang, Record<string, string>> = {
  pl: { one: 'zlecenie', few: 'zlecenia', many: 'zleceń', other: 'zlecenia' },
  ru: { one: 'заказ', few: 'заказа', many: 'заказов', other: 'заказа' },
  en: { one: 'job', other: 'jobs' },
}

export function nOrders(n: number, lang: Lang = 'pl'): string {
  const rule = new Intl.PluralRules(LOCALE[lang]).select(n)
  const forms = ORDERS[lang]
  return `${n} ${forms[rule] ?? forms.other}`
}

export const money = (v: number | null | undefined, lang: Lang = 'pl') =>
  `${Math.round(Number(v ?? 0)).toLocaleString(LOCALE[lang])} zł`

export const money2 = (v: number | null | undefined, lang: Lang = 'pl') =>
  `${Number(v ?? 0).toLocaleString(LOCALE[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`

export const dateShort = (iso: string | null | undefined, lang: Lang = 'pl') =>
  iso ? new Date(iso).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: '2-digit' }) : '—'

export const dateFull = (iso: string | null | undefined, lang: Lang = 'pl') =>
  iso ? new Date(iso).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const dateTime = (iso: string | null | undefined, lang: Lang = 'pl') =>
  iso ? new Date(iso).toLocaleString(LOCALE[lang], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/** «через 40 мин», «2 ч назад» — для лент событий и таймеров подтверждения. */
export function fromNow(iso: string | null | undefined, lang: Lang = 'pl'): string {
  if (!iso) return '—'
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

/** «2026-09» → «сен. 2026»: подпись месяца для помесячных графиков. */
export const monthName = (ym: string, lang: Lang = 'pl') => {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE[lang], { month: 'short', year: '2-digit' })
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

/** Месяц как границы для запросов: панель почти везде считает «за месяц». */
export function monthRange(offset = 0) {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}
