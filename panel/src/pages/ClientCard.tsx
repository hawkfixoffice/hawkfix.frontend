import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateFull, dateShort } from '../lib/fmt'
import Status from '../ui/Status'
import Stat from '../ui/Stat'

export default function ClientCard({ me }: { me: Me }) {
  const showMoney = me.role === 'admin'
  const { id = '' } = useParams()
  const { t, lang } = useT()
  const [c, setC] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    sb.from(showMoney ? 'clients' : 'clients_desk').select('*').eq('id', id).maybeSingle().then(({ data }) => { setC(data); setNote(data?.note ?? '') })
    sb.from('orders').select('*, staff!orders_master_id_fkey(full_name), order_reports(gross, master_share, company_net)')
      .eq('client_id', id).order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data ?? []))
  }, [id])

  if (!c) return <p className="empty">{t('common.loading')}</p>

  const done = orders.filter((o) => o.status === 'done')
  const avg = done.length ? done.reduce((a, o) => a + Number(o.order_reports?.[0]?.gross ?? 0), 0) / done.length : 0

  return (
    <>
      <div className="page__head">
        <div>
          <Link className="btn btn--ghost btn--sm" to="/clients">← {t('crm.title')}</Link>
          <h1 className="h1" style={{ marginTop: 10 }}>{c.name}</h1>
          <p className="sub">
            <a href={`tel:${c.phone}`}>{c.phone}</a>
            {c.email && <> · {c.email}</>} · {c.address ?? c.district ?? '—'}
          </p>
        </div>
        <span className="badge badge--dark">{t(`crm.${c.status}`)}</span>
      </div>

      <div className="grid grid--4">
        {showMoney && <Stat label={t('crm.spent')} value={money(c.spent_total, lang)} />}
        <Stat label={t('crm.orders')} value={c.orders_count} />
        {showMoney && <Stat label={t('dash.avgCheck')} value={money(avg, lang)} />}
        <Stat label={t('crm.since')} value={<span style={{ fontSize: '1.2rem' }}>{dateFull(c.first_order_at ?? c.created_at, lang)}</span>} />
      </div>

      <div className="grid grid--wide-left">
        <div className="card card--flush">
          <div className="card__head" style={{ padding: '20px 22px 0' }}><h2 className="h2">{t('crm.history')}</h2></div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>№</th><th>{t('ord.master')}</th><th>{t('ord.when')}</th>
                <th className="right">{t('ord.sum')}</th><th></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} data-click onClick={() => { location.hash = `#/orders/${o.id}` }}>
                    <td className="num"><b>{o.order_no}</b></td>
                    <td>{o.staff?.full_name ?? '—'}</td>
                    <td className="num">{dateShort(o.scheduled_date ?? o.created_at, lang)}</td>
                    <td className="right num">{money(o.order_reports?.[0]?.gross ?? o.quoted_total, lang)}</td>
                    <td className="right"><Status value={o.status} /></td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={5}><p className="empty">{t('common.empty')}</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h2 className="h2">{t('crm.note')}</h2></div>
          <div className="field">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} />
          </div>
          <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }}
                  onClick={() => sb.from('clients').update({ note }).eq('id', id).then(() => {})}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </>
  )
}
