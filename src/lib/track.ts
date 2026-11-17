import { SUPA_URL, anonHeaders } from './supa'

/** Счётчики пути «сайт → заявка». Каждое событие — +1 к дневной сумме в базе
 *  (`site_funnel`). Ни идентификаторов, ни cookie, ни содержимого полей:
 *  только «сколько раз за день», поэтому согласия на них не требуется.
 *
 *  Одно событие считается не больше раза за загрузку страницы — иначе
 *  метания туда-сюда по шагам раздували бы воронку. */
export type FunnelEvent =
  | 'calc_seen' | 'item_add' | 'form_start' | 'step_where' | 'step_send'
  | 'lead_ok' | 'lead_fail' | 'wa_draft' | 'wa_head' | 'wa_page' | 'wa_form'

const sent = new Set<string>()

export function track(event: FunnelEvent, locale?: string) {
  if (typeof window === 'undefined' || sent.has(event)) return
  // Автотесты (puppeteer, Playwright) и локальная разработка воронку не портят
  if (navigator.webdriver || /^(localhost|127\.|192\.168\.)/.test(location.hostname)) return
  sent.add(event)
  const lang = locale ?? document.documentElement.lang?.slice(0, 2) ?? 'pl'
  fetch(`${SUPA_URL}/rest/v1/rpc/track_step`, {
    method: 'POST',
    keepalive: true,
    headers: { ...anonHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event: event, p_locale: lang }),
  }).catch(() => { /* счётчик не важнее страницы */ })
}
