import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'
import { money, dateFull, fromNow } from '../lib/fmt'
import { fetchRoute, navLink, geocode, type Pt } from '../lib/maps'
import { sb } from '../lib/supabase'

interface Order {
  id: string; order_no: string; address: string | null; scheduled_date: string | null
  scheduled_slot: string | null; deadline_at: string | null; quoted_total: number
  lat: number | null; lon: number | null; status: string
  clients?: { name: string; phone: string } | null
}

/** Первое, что видит мастер: куда и когда ехать.
 *  Время выезда считается назад от начала окна: минус дорога, минус
 *  четверть часа на парковку и подъём — иначе «к 10:00» превращается
 *  в «в 10:00 ещё в машине». */
export default function NextJob({ order, myId }: { order: Order; myId: string }) {
  const { t, lang } = useT()
  const [drive, setDrive] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await sb.from('staff_locations').select('lat, lon').eq('staff_id', myId).maybeSingle()
      if (!data || !alive) return
      let to: Pt | null = order.lat && order.lon ? { lat: Number(order.lat), lon: Number(order.lon) } : null
      if (!to && order.address) to = await geocode(order.address)
      if (!to || !alive) return
      const r = await fetchRoute({ lat: Number(data.lat), lon: Number(data.lon) }, to)
      if (alive) setDrive(r.total.min)
    })()
    return () => { alive = false }
  }, [order.id, myId])

  // Начало окна приезда: «10:00-12:00» → 10:00 выбранного дня
  const startsAt = (() => {
    if (!order.scheduled_date) return order.deadline_at ? new Date(order.deadline_at) : null
    const hhmm = (order.scheduled_slot ?? '').split('-')[0]?.trim()
    return new Date(`${order.scheduled_date}T${/^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '08:00'}:00`)
  })()

  const buffer = 15
  const leaveAt = startsAt && drive != null
    ? new Date(startsAt.getTime() - (drive + buffer) * 60_000)
    : null
  const late = leaveAt ? leaveAt.getTime() <= now : false

  const to: Pt | null = order.lat && order.lon ? { lat: Number(order.lat), lon: Number(order.lon) } : null

  return (
    <div className="nextjob" data-hot={late || undefined}>
      <div className="nextjob__head">
        <span className="nextjob__kicker">{t('ord.next')}</span>
        <span className="badge badge--dark num">{order.order_no}</span>
      </div>

      <div className="nextjob__main">
        <p className="nextjob__when">
          {leaveAt
            ? (late ? t('ord.leaveNow') : `${t('ord.leaveIn')} ${fromNow(leaveAt.toISOString(), lang).replace(/^(через|in|za)\s*/i, '')}`)
            : (order.scheduled_slot ?? dateFull(order.scheduled_date, lang))}
        </p>
        <p className="nextjob__addr">{order.address ?? t('common.none')}</p>
        <p className="nextjob__meta">
          {order.clients?.name}
          {order.scheduled_date && ` · ${dateFull(order.scheduled_date, lang)} ${order.scheduled_slot ?? ''}`}
          {drive != null && ` · ${t('ord.route').toLowerCase()} ${drive} ${t('dash.min')}`}
          {` · ${money(order.quoted_total, lang)}`}
        </p>
      </div>

      <div className="nextjob__acts">
        <Link className="btn btn--primary" to={`/orders/${order.id}`}>{t('ord.openOrder')}</Link>
        {(to || order.address) && (
          <a className="btn btn--onDark" target="_blank" rel="noreferrer"
             href={navLink(to ?? { lat: 52.2297, lon: 21.0122 }, order.address ?? undefined)}>
            {t('ord.navigate')} ↗
          </a>
        )}
        {order.clients?.phone && (
          <a className="btn btn--ghostDark" href={`tel:${order.clients.phone}`}>{order.clients.phone}</a>
        )}
      </div>
    </div>
  )
}

/** Пришло предложение — это главное на экране, крупно и с таймером. */
export function NewJobBanner({ offers, onAnswer }: {
  offers: any[]
  onAnswer: (id: string, yes: boolean) => void
}) {
  const { t, lang } = useT()
  if (!offers.length) return null

  /** Сколько осталось на ответ. Подписываем прямо, иначе «через 19 минут»
   *  читается как время выезда, а это срок принять заказ. */
  const left = (iso: string) => {
    const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000))
    if (min >= 60) return `${Math.floor(min / 60)} ${t('ord.h')} ${min % 60} ${t('dash.min')}`
    return `${min} ${t('dash.min')}`
  }

  return (
    <div className="newjob">
      <p className="newjob__title">{t('ord.newOne')}</p>
      <div className="newjob__list">
        {offers.map((o) => (
          <div className="newjob__row" key={o.id}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b className="newjob__sum num">{money(o.orders?.quoted_total, lang)}</b>
              <span className="newjob__addr">{o.orders?.address ?? '—'}</span>
              <small>
                {o.orders?.scheduled_date ?? ''} {o.orders?.scheduled_slot ?? ''} · {o.orders?.order_no}
              </small>
            </span>
            <span className="split">
              <span className="newjob__timer">
                <small>{t('ord.answerIn')}</small>
                <b className="num">{left(o.expires_at)}</b>
              </span>
              <button className="btn btn--dark" onClick={() => onAnswer(o.id, true)}>{t('ord.accept')}</button>
              <button className="btn btn--decline" onClick={() => onAnswer(o.id, false)}>{t('ord.decline')}</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
