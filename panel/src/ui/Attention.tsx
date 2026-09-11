import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort, fromNow } from '../lib/fmt'
import Avatar from './Avatar'
import Assign from './Assign'

interface Row {
  id: string
  order_no: string
  status: string
  address: string | null
  urgent: boolean
  scheduled_date: string | null
  scheduled_slot: string | null
  deadline_at: string | null
  quoted_total: number | null
  client_name: string | null
  reason: 'offered' | 'quiet' | 'refused' | 'no_master' | 'waiting'
  offered_to: { id: string; name: string; avatar_path: string | null; expires_at: string } | null
  tried: { name: string; status: string; at: string | null }[]
  refused: number
}

/** «Кому предложен» и «никто не взял» — одним списком.
 *
 *  Автоподбор работает молча: заказ уходит мастеру, тот может отказаться
 *  или промолчать, ночью рассылка вообще заморожена. Офис должен видеть
 *  и то, у кого заказ сейчас, и то, что заказ завис, — и назначать мастера
 *  прямо отсюда, не проваливаясь в карточку. */
export default function Attention() {
  const { t, lang } = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [pick, setPick] = useState<Row | null>(null)

  const load = () => { sb.rpc('orders_attention').then(({ data }) => setRows((data ?? []) as Row[])) }
  useEffect(load, [])
  // Срок ответа мастера идёт минутами — список должен обновляться сам
  useEffect(() => {
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  if (rows.length === 0) return null

  const need = rows.filter((r) => r.reason === 'refused' || r.reason === 'no_master')

  return (
    <div className="card card--flush">
      <div className="card__head" style={{ padding: '20px 22px 0' }}>
        <div>
          <h2 className="h2">{t('att.title')}</h2>
          <p className="card__note">
            {need.length > 0 ? t('att.needHands', { n: need.length }) : t('att.allMoving')}
          </p>
        </div>
        <span className="badge badge--ghost">{rows.length}</span>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="num">
                  <Link to={`/orders/${r.id}`}><b>{r.order_no}</b></Link>
                  {r.urgent && <span className="badge badge--warn" style={{ marginInlineStart: 6 }}>!</span>}
                </td>
                <td>
                  {r.client_name ?? '—'}
                  <small className="muted" style={{ display: 'block' }}>{r.address ?? '—'}</small>
                </td>
                <td className="num">
                  {dateShort(r.scheduled_date ?? r.deadline_at, lang)} {r.scheduled_slot ?? ''}
                </td>
                <td>
                  {r.reason === 'offered' && r.offered_to ? (
                    <span className="split split--tight">
                      <Avatar name={r.offered_to.name} path={r.offered_to.avatar_path} size="sm" />
                      <span>
                        <b>{r.offered_to.name}</b>
                        <small className="muted" style={{ display: 'block' }}>
                          {t('att.answerUntil')} {fromNow(r.offered_to.expires_at, lang)}
                        </small>
                      </span>
                    </span>
                  ) : (
                    <span className="badge" data-reason={r.reason}>{t(`att.${r.reason}`)}</span>
                  )}
                  {r.tried.length > 0 && (
                    <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                      {t('att.tried')}: {r.tried.map((x) => x.name).join(', ')}
                    </small>
                  )}
                </td>
                <td className="right num">{money(r.quoted_total, lang)}</td>
                <td className="right">
                  <button className="btn btn--dark btn--sm" onClick={() => setPick(r)}>
                    {t('att.assign')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pick && (
        <Assign orderId={pick.id} orderNo={pick.order_no}
                onClose={() => setPick(null)} onDone={load} />
      )}
    </div>
  )
}
