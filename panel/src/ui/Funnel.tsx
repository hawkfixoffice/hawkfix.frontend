import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { dateShort } from '../lib/fmt'

interface Stats {
  since: string
  events: Record<string, number>
  orders_form: number
  orders_wa_site: number
  orders_wa: number
  orders_other: number
}

/** Путь на сайте и каналы заказов за 30 дней.
 *
 *  Главная цифра — доля заказов, пришедших с сайта (форма или WhatsApp
 *  с кодом сметы), среди всех. Шаги — дневные суммы без данных о людях,
 *  одно событие не больше раза за загрузку страницы. */
const STEPS = ['calc_seen', 'item_add', 'form_start', 'step_where', 'step_send', 'lead_ok'] as const
const WA = ['wa_draft', 'wa_head', 'wa_page', 'wa_form'] as const

export default function Funnel() {
  const { t, lang } = useT()
  const [d, setD] = useState<Stats | null>(null)
  useEffect(() => { sb.rpc('funnel_stats', { p_days: 30 }).then(({ data }) => setD((data ?? null) as Stats | null)) }, [])
  if (!d || !d.events) return null

  const ev = (k: string) => d.events[k] ?? 0
  const top = Math.max(1, ...STEPS.map(ev), ...WA.map(ev))
  const all = d.orders_form + d.orders_wa_site + d.orders_wa + d.orders_other
  const site = d.orders_form + d.orders_wa_site
  const share = all ? Math.round((site / all) * 100) : 0

  const row = (k: string) => (
    <li key={k} className="funnel__row">
      <span className="funnel__label">{t(`fun.${k}`)}</span>
      <span className="funnel__bar"><i style={{ width: `${(ev(k) / top) * 100}%` }} /></span>
      <b className="num">{ev(k)}</b>
    </li>
  )

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2 className="h2">{t('fun.title')}</h2>
          <p className="card__note">{t('fun.note', { since: dateShort(d.since, lang) })}</p>
        </div>
        <span className="badge badge--ghost num" title={t('fun.shareHint')}>{share}% {t('fun.share')}</span>
      </div>

      <div className="grid grid--2">
        <div>
          <ol className="funnel">{STEPS.map(row)}{row('lead_fail')}</ol>
        </div>
        <div>
          <ol className="funnel">{WA.map(row)}</ol>
          <ul className="funnel funnel--orders">
            <li className="funnel__row"><span className="funnel__label">{t('fun.ordersForm')}</span><b className="num">{d.orders_form}</b></li>
            <li className="funnel__row"><span className="funnel__label">{t('fun.ordersWaSite')}</span><b className="num">{d.orders_wa_site}</b></li>
            <li className="funnel__row"><span className="funnel__label">{t('fun.ordersWa')}</span><b className="num">{d.orders_wa}</b></li>
            <li className="funnel__row"><span className="funnel__label">{t('fun.ordersOther')}</span><b className="num">{d.orders_other}</b></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
