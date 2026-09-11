import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { dateShort, dateTime, fromNow } from '../lib/fmt'
import Stat from './Stat'
import Status from './Status'
import { BarChart, type Point } from './Chart'

interface Day { d: string; minutes: number; first_at: string | null; last_at: string | null; actions: number; orders: number }
interface Touched {
  id: string; order_no: string; status: string; client: string | null; address: string | null
  actions: number; last_at: string; last_type: string
}
interface Data {
  by_day: Day[]; minutes_total: number; days_worked: number; minutes_today: number
  last_seen: string | null; orders_touched: number; actions_total: number; orders: Touched[]
}

/** «Часы:минуты» — 95 минут читаются как 1:35, а не как полтора часа. */
const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

/** Время суток из отметки, по Варшаве — когда человек сел и когда встал. */
const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }) : '—'

/** Рабочее время и заказы сотрудника, который не ездит.
 *
 *  У менеджера нет ни отчётов, ни выработки в деньгах: его работа — часы в
 *  панели и заказы, которых он касался. Касание считается по следу в
 *  журнале заказа: сменил статус, назначил мастера, закрыл отчётом. */
export default function Activity({ staffId, days = 30 }: { staffId: string; days?: number }) {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [d, setD] = useState<Data | null>(null)
  const [span, setSpan] = useState(days)

  useEffect(() => {
    sb.rpc('staff_activity', { p_staff: staffId, days: span }).then(({ data }) => setD(data as Data))
  }, [staffId, span])

  if (!d) return <p className="empty">{t('common.loading')}</p>

  const chart: Point[] = (d.by_day ?? []).map((x) => ({
    label: dateShort(x.d, lang),
    value: Math.round((x.minutes / 60) * 10) / 10,
    extra: x.minutes
      ? `${clock(x.first_at)}–${clock(x.last_at)} · ${t('act.actions')}: ${x.actions}`
      : t('act.offline'),
  }))

  const week = (d.by_day ?? []).slice(-7).reduce((a, x) => a + x.minutes, 0)

  return (
    <>
      <div className="grid grid--4">
        <Stat label={t('act.today')} value={hm(d.minutes_today)}
              foot={<span>{d.last_seen ? `${t('act.lastSeen')} ${fromNow(d.last_seen, lang)}` : t('act.never')}</span>} />
        <Stat label={t('act.week')} value={hm(week)} art={chart} format={(v) => `${v} ${t('act.h')}`} />
        <Stat label={t('act.period')} value={hm(d.minutes_total)}
              foot={<span>{t('act.daysWorked')}: {d.days_worked}</span>} />
        <Stat label={t('act.orders')} value={d.orders_touched}
              foot={<span>{t('act.actions')}: {d.actions_total}</span>} />
      </div>

      <div className="card">
        <div className="card__head">
          <div><h2 className="h2">{t('act.byDay')}</h2>
            <p className="card__note">{t('act.byDayNote')}</p></div>
          <div className="chips">
            {[7, 30, 90].map((n) => (
              <button key={n} className="chip" data-on={span === n || undefined} onClick={() => setSpan(n)}>
                {n} {t('act.days')}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={chart} height={210} format={(v) => `${v} ${t('act.h')}`} />
      </div>

      <div className="card card--flush">
        <div className="card__head" style={{ padding: '20px 22px 0' }}>
          <div><h2 className="h2">{t('act.ordersTitle')}</h2>
            <p className="card__note">{t('act.ordersNote')}</p></div>
          <span className="badge badge--ghost">{d.orders.length}</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>№</th><th>{t('ord.client')}</th><th>{t('act.lastAction')}</th>
              <th className="right">{t('act.actions')}</th><th className="right"></th>
            </tr></thead>
            <tbody>
              {d.orders.map((o) => (
                <tr key={o.id} data-click onClick={() => nav(`/orders/${o.id}`)}>
                  <td className="num"><b>{o.order_no}</b></td>
                  <td>
                    {o.client ?? '—'}
                    <small className="muted" style={{ display: 'block' }}>{o.address ?? ''}</small>
                  </td>
                  <td>
                    {t(`ev.${o.last_type}`)}
                    <small className="muted" style={{ display: 'block' }}>{dateTime(o.last_at, lang)}</small>
                  </td>
                  <td className="right num">{o.actions}</td>
                  <td className="right"><Status value={o.status} /></td>
                </tr>
              ))}
              {d.orders.length === 0 && (
                <tr><td colSpan={5}><p className="empty">{t('act.noOrders')}</p></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
