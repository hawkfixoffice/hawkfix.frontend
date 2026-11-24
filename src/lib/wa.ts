import { CONTACT } from './ui'
import { track } from './track'
import type { Selection } from './quote'

/** WhatsApp — главный канал, которым клиенты пользуются и без нас.
 *  Сайт с ним не воюет, а делает так, чтобы чат начинался не с «Dzień dobry»,
 *  а с кода заявки и сметы: офис сразу видит, что нужно, и находит черновик
 *  в панели по коду. */

const LEAD_ENDPOINT = import.meta.env.VITE_LEAD_ENDPOINT
  || 'https://vpijumbbmwjibvlohfug.supabase.co/functions/v1/lead'

export const waHref = (text: string) => `${CONTACT.whatsappHref}?text=${encodeURIComponent(text)}`

const T = {
  pl: { hi: 'Dzień dobry! Piszę ze strony hawkfix.pl', about: 'w sprawie', quote: 'Mój kosztorys', order: 'Zamówienie', total: 'Razem', what: 'Opis', photos: 'Zdjęcia wyślę tutaj.', next: 'Adres i termin ustalmy tutaj.' },
  uk: { hi: 'Добрий день! Пишу з сайту hawkfix.pl', about: 'щодо', quote: 'Мій кошторис', order: 'Замовлення', total: 'Разом', what: 'Опис', photos: 'Фото надішлю тут.', next: 'Адресу й час узгодьмо тут.' },
  ru: { hi: 'Здравствуйте! Пишу с сайта hawkfix.pl', about: 'по поводу', quote: 'Моя смета', order: 'Заказ', total: 'Итого', what: 'Описание', photos: 'Фото пришлю сюда.', next: 'Адрес и время давайте согласуем здесь.' },
  en: { hi: "Hello! I'm writing from hawkfix.pl", about: 'about', quote: 'My estimate', order: 'Order', total: 'Total', what: 'Details', photos: "I'll send photos here.", next: "Let's agree on the address and time here." },
} as const
type L = keyof typeof T
const tx = (l: string) => T[(l in T ? l : 'pl') as L]

/** Текущая смета на странице: калькулятор кладёт сюда строки, чтобы любая
 *  кнопка WhatsApp на странице отправила их вместе с приветствием. */
let quote: { lines: string[]; total: string; selection?: Selection[] } | null = null
export function setQuoteContext(q: typeof quote) { quote = q }
/** Выбранные в калькуляторе работы — попап WhatsApp начинает с них */
export const quoteSelection = (): Selection[] => quote?.selection ?? []

/** Текст для ссылки «без формы»: приветствие с темой страницы и сметой. */
export function contextText(locale: string) {
  const t = tx(locale)
  const h1 = document.querySelector('main h1')?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
  // Главная: её заголовок — слоган, а не тема обращения
  const home = /^\/(uk\/|ru\/|en\/)?$/.test(location.pathname)
  const parts = [home || !h1 ? `${t.hi}.` : `${t.hi} — ${t.about}: ${h1.slice(0, 90)}.`]
  if (quote?.lines.length) parts.push('', `${t.quote}:`, ...quote.lines, `${t.total}: ${quote.total}`)
  return parts.join('\n')
}

/** Событие, по которому открывается попап «Napisz na WhatsApp» (`WaModal`) */
export const WA_OPEN = 'hawkfix:wa'
export const openWaPopup = () => window.dispatchEvent(new CustomEvent(WA_OPEN))

/** Ставится один раз на весь сайт. Любая ссылка WhatsApp без готового текста
 *  (шапка, подвал, контакты, кнопка «Napisz») открывает не голый чат, а попап
 *  с формой: человек пишет, что случилось, выбирает работы — и в чат уходит
 *  сообщение с кодом, а в панель черновик. Ссылки с готовым текстом (ошибка
 *  отправки, фото к заявке) и «без формы» (`data-wa="direct"`) идут как есть.
 *  Каждое нажатие считается в воронке по месту, где была кнопка. */
export function installWaLinks() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="https://wa.me/"]') as HTMLAnchorElement | null
    if (!a) return
    const locale = document.documentElement.lang?.slice(0, 2) || 'pl'
    if (a.dataset.wa === 'draft') return // черновик считает сам WaDraft
    if (a.dataset.wa === 'direct') {
      track('wa_page', locale)
      if (!a.href.includes('?text=')) a.href = waHref(contextText(locale))
      return
    }
    if (a.href.includes('?text=')) return
    // Клик с модификатором (новая вкладка) — человек явно хочет чат
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      a.href = waHref(contextText(locale))
      return
    }
    e.preventDefault()
    track(a.closest('header') ? 'wa_head' : a.closest('.calc') ? 'wa_form' : 'wa_page', locale)
    openWaPopup()
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

// ── Черновик с кодом ──────────────────────────────────────────────────────

const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODES_KEY = 'hawkfix.wa'

/** Код для этой сметы. Та же смета — тот же код (повторное нажатие не
 *  плодит черновики), другая смета — новый. Живёт до закрытия вкладки. */
export function draftCode(sig: string): string {
  let map: Record<string, string> = {}
  try { map = JSON.parse(sessionStorage.getItem(CODES_KEY) ?? '{}') } catch { /* пусто */ }
  if (map[sig]) return map[sig]
  const rnd = new Uint32Array(5)
  crypto.getRandomValues(rnd)
  const code = `HF-${[...rnd].map((n) => ALPHA[n % ALPHA.length]).join('')}`
  try { sessionStorage.setItem(CODES_KEY, JSON.stringify({ ...map, [sig]: code })) } catch { /* без памяти — новый код */ }
  return code
}

export function draftText(locale: string, code: string, lines: string[], total: string, comment = '', photos = false) {
  const t = tx(locale)
  return [
    `${t.hi}.`,
    `${t.order} ${code}`,
    '',
    ...lines,
    total ? `${t.total}: ${total}` : null,
    comment.trim() ? `\n${t.what}: ${comment.trim().slice(0, 600)}` : null,
    photos ? t.photos : null,
    '',
    t.next,
  ].filter((x): x is string => x !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

/** Черновик уходит фоном в момент нажатия; ссылка открывается сама.
 *  Если запрос не дойдёт — в чате всё равно будет вся смета. */
export function postDraft(body: {
  code: string; locale: string; urgent: boolean; comment?: string
  items: unknown[]; totals: Record<string, unknown>
}) {
  track('wa_draft', body.locale)
  fetch(LEAD_ENDPOINT, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, channel: 'wa', page: location.pathname }),
  }).catch(() => { /* смета уже в тексте сообщения */ })
}
