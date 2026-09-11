import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort, fromNow } from '../lib/fmt'
import Status from '../ui/Status'
import NewNotice from '../ui/NewNotice'
import DeleteOrder from '../ui/DeleteOrder'

type Tab = 'inwork' | 'overdue' | 'new' | 'done' | 'all'

const IN_WORK = ['offered', 'assigned', 'en_route', 'shopping', 'in_progress']

/** Заказы «висят», пока мастер не сдаст отчёт: вкладка «в работе» —
 *  это и есть список незакрытых, а просроченные подсвечены отдельно. */
export default function Orders({ me }: { me: Me }) {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('inwork')
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(true)
  const [counts, setCounts] = useState<Record<Tab, number>>({ inwork: 0, overdue: 0, new: 0, done: 0, all: 0 })
  /** Кому заказ предложен прямо сейчас: order_id → предложение */
  const [offers, setOffers] = useState<Record<string, any>>({})
  /** Заказ, который админ собирается удалить, и счётчик перезагрузок списка */
  const [kill, setKill] = useState<any>(null)
  const [nonce, setNonce] = useState(0)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    setBusy(true)
    let req = sb.from('orders')
      .select('id, order_no, status, deadline_at, scheduled_date, scheduled_slot, quoted_total, address, district, urgent, clients(id, name, phone), staff!orders_master_id_fkey(id, full_name), order_reports(gross, master_share)')
      .order('deadline_at', { ascending: true, nullsFirst: false })
      .limit(200)

    if (tab === 'inwork') req = req.in('status', IN_WORK)
    if (tab === 'new') req = req.eq('status', 'new')
    if (tab === 'done') req = req.eq('status', 'done').order('finished_at', { ascending: false })
    if (tab === 'overdue') req = req.in('status', IN_WORK).lt('deadline_at', new Date().toISOString())

    req.then(({ data }) => {
      const list = data ?? []
      setRows(list)
      setBusy(false)
      if (me.role !== 'master' && list.length) {
        sb.from('order_offers')
          .select('order_id, expires_at, staff(full_name)')
          .eq('status', 'pending')
          .in('order_id', list.map((o: any) => o.id))
          .then(({ data: fs }) => setOffers(Object.fromEntries(
            (fs ?? []).map((f: any) => [f.order_id, f]))))
      }
    })
  }, [tab, nonce])

  // Счётчики на вкладках: без них свежая заявка молча лежит в «Новых»,
  // пока человек смотрит на пустую вкладку «В работе»
  useEffect(() => {
    const count = (build: (r: any) => any) =>
      build(sb.from('orders').select('id', { count: 'exact', head: true }))
        .then(({ count }: { count: number | null }) => count ?? 0)

    Promise.all([
      count((r: any) => r.in('status', IN_WORK)),
      count((r: any) => r.in('status', IN_WORK).lt('deadline_at', new Date().toISOString())),
      count((r: any) => r.eq('status', 'new')),
      count((r: any) => r.eq('status', 'done')),
      count((r: any) => r),
    ]).then(([inwork, overdue, nw, done, all]) =>
      setCounts({ inwork, overdue, new: nw, done, all }))
  }, [tab, nonce])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((o) =>
      [o.order_no, o.clients?.name, o.clients?.phone, o.address, o.staff?.full_name]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(s)))
  }, [rows, q])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'inwork', label: t('ord.inwork') },
    { key: 'overdue', label: t('ord.overdue') },
    ...(me.role !== 'master' ? [{ key: 'new' as Tab, label: t('ord.new') }] : []),
    { key: 'done', label: t('ord.done') },
    { key: 'all', label: t('common.all') },
  ]

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('ord.title')}</h1>
          <p className="sub">{list.length}</p>
        </div>
        <div className="split">
          <div className="field" style={{ minWidth: 240 }}>
            <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="chips">
        {tabs.map((x) => (
          <button key={x.key} className="chip" data-on={tab === x.key || undefined} onClick={() => setTab(x.key)}>
            {x.label}
            {counts[x.key] > 0 && <span className="chip__n">{counts[x.key]}</span>}
          </button>
        ))}
      </div>

      {tab !== 'new' && <NewNotice onOpen={() => setTab('new')} />}

      {flash && <p className="muted tiny">{flash}</p>}

      {kill && (
        <DeleteOrder order={kill}
                     onClose={() => setKill(null)}
                     onDone={(no) => {
                       setKill(null)
                       setFlash(t('del.done', { no }))
                       setNonce((n) => n + 1)
                     }} />
      )}

      <div className="card card--flush">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>№</th><th>{t('ord.client')}</th><th>{t('crm.address')}</th>
              {me.role !== 'master' && <th>{t('ord.master')}</th>}
              <th>{t('ord.when')}</th><th className="right">{t('ord.sum')}</th><th className="right"></th>
            </tr></thead>
            <tbody>
              {busy && <tr><td colSpan={7}><p className="empty">{t('common.loading')}</p></td></tr>}
              {!busy && list.length === 0 && <tr><td colSpan={7}><p className="empty">{t('common.empty')}</p></td></tr>}
              {list.map((o) => {
                const late = o.deadline_at && new Date(o.deadline_at) < new Date()
                  && !['done', 'cancelled'].includes(o.status)
                return (
                  <tr key={o.id} data-click onClick={() => nav(`/orders/${o.id}`)}>
                    <td className="num">
                      <b>{o.order_no}</b>
                      {o.urgent && <span className="badge badge--warn" style={{ marginInlineStart: 6 }}>!</span>}
                    </td>
                    <td>
                      <div className="who"><span style={{ minWidth: 0 }}>
                        <b>{o.clients?.name ?? '—'}</b>
                        <small>{o.clients?.phone ?? ''}</small>
                      </span></div>
                    </td>
                    <td className="muted">{o.address ?? o.district ?? '—'}</td>
                    {me.role !== 'master' && (
                      <td>
                        {o.staff?.full_name ?? (offers[o.id] ? (
                          <span>
                            <b>{offers[o.id].staff?.full_name}</b>
                            <small className="muted" style={{ display: 'block' }}>
                              {t('att.offered')} · {t('att.answerUntil')} {fromNow(offers[o.id].expires_at, lang)}
                            </small>
                          </span>
                        ) : <span className="muted">{t('common.none')}</span>)}
                      </td>
                    )}
                    <td className="num">
                      {dateShort(o.scheduled_date ?? o.deadline_at, lang)} {o.scheduled_slot ?? ''}
                      {late && <div className="tiny" style={{ color: 'var(--bad)' }}>{fromNow(o.deadline_at, lang)}</div>}
                    </td>
                    <td className="right num">
                      {o.status === 'done' && o.order_reports?.[0]
                        ? money(o.order_reports[0].gross, lang)
                        : money(o.quoted_total, lang)}
                    </td>
                    <td className="right">
                      <span className="split" style={{ justifyContent: 'flex-end' }}>
                        <Status value={o.status} overdue={!!late} />
                        {/* Клик по строке открывает заказ, поэтому крестик
                            обязан остановить всплытие — иначе удаление
                            и переход сработают вместе */}
                        {me.role === 'admin' && (
                          <button className="btn btn--ghost btn--sm" title={t('del.title')}
                                  aria-label={`${t('del.title')} ${o.order_no}`}
                                  onClick={(e) => { e.stopPropagation(); setKill(o) }}>✕</button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
