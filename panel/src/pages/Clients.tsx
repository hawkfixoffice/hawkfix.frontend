import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort, initials } from '../lib/fmt'

const TONE: Record<string, string> = {
  new: 'badge--ghost', active: 'badge--mint', regular: 'badge--forest',
  vip: 'badge--dark', lost: 'badge--warn',
}

/** CRM: кто заказывал, на сколько и когда в последний раз.
 *  Статус не выставляется руками — он следствие истории заказов. */
export default function Clients({ me }: { me: Me }) {
  const showMoney = me.role === 'admin'
  const { t, lang } = useT()
  const nav = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    // Менеджеру суммы не отдаём даже по сети: для него — представление
    // clients_desk, где денежных колонок просто нет
    sb.from(showMoney ? 'clients' : 'clients_desk').select('*')
      .order('last_order_at', { ascending: false, nullsFirst: false }).limit(500)
      .then(({ data }) => setRows(data ?? []))
  }, [])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((c) =>
      (status === 'all' || c.status === status) &&
      (!s || [c.name, c.phone, c.address, c.email].filter(Boolean).some((v: string) => v.toLowerCase().includes(s))))
  }, [rows, q, status])

  const sum = list.reduce((a, c) => a + Number(c.spent_total || 0), 0)

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('crm.title')}</h1>
          <p className="sub">{list.length}{showMoney ? ` · ${money(sum, lang)}` : ''}</p>
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="chips">
        {['all', 'new', 'active', 'regular', 'vip', 'lost'].map((s) => (
          <button key={s} className="chip" data-on={status === s || undefined} onClick={() => setStatus(s)}>
            {s === 'all' ? t('common.all') : t(`crm.${s}`)}
          </button>
        ))}
      </div>

      <div className="card card--flush">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>{t('ord.client')}</th><th>{t('crm.phone')}</th><th>{t('crm.address')}</th>
              <th className="right">{t('crm.orders')}</th>
              {showMoney && <th className="right">{t('crm.spent')}</th>}
              <th>{t('crm.last')}</th><th></th>
            </tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} data-click onClick={() => nav(`/clients/${c.id}`)}>
                  <td><div className="who">
                    <span className="avatar avatar--sm">{initials(c.name)}</span>
                    <span style={{ minWidth: 0 }}><b>{c.name}</b><small>{c.email ?? ''}</small></span>
                  </div></td>
                  <td className="num">{c.phone}</td>
                  <td className="muted">{c.address ?? c.district ?? '—'}</td>
                  <td className="right num">{c.orders_count}</td>
                  {showMoney && <td className="right num"><b>{money(c.spent_total, lang)}</b></td>}
                  <td className="num muted">{dateShort(c.last_order_at, lang)}</td>
                  <td className="right"><span className={`badge ${TONE[c.status]}`}>{t(`crm.${c.status}`)}</span></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7}><p className="empty">{t('common.empty')}</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
