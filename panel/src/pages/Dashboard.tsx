import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort, fromNow, monthName, nOrders } from '../lib/fmt'
import Stat from '../ui/Stat'
import NewNotice from '../ui/NewNotice'
import Attention from '../ui/Attention'
import Avatar from '../ui/Avatar'
import { AreaChart, BarChart, type Point } from '../ui/Chart'
import Status from '../ui/Status'
import Range, { useRange } from '../ui/Range'
import NextJob, { NewJobBanner } from '../ui/NextJob'

export default function Dashboard({ me }: { me: Me }) {
  if (me.role === 'master') return <MasterView me={me} />
  if (me.role === 'manager') return <ManagerView me={me} />
  return <AdminView me={me} />
}

/* ============================ администратор ============================ */
interface RangeData {
  revenue: number; revenue_prev: number; orders: number; orders_prev: number
  company_net: number; company_share: number; tax: number; masters_paid: number
  materials: number; cash: number; card: number; avg_check: number
  by_day: { d: string; revenue: number; profit: number; orders: number }[]
  by_month: { m: string; revenue: number; profit: number; orders: number }[]
  by_master: { id: string; name: string; share: number; orders: number }[]
}

const pct = (now: number, before: number) =>
  before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0

function AdminView({ me }: { me: Me }) {
  const { t, lang } = useT()
  const range = useRange()
  const [d, setD] = useState<RangeData | null>(null)
  const [ops, setOps] = useState<any>(null)
  const [recent, setRecent] = useState<any[]>([])

  useEffect(() => {
    sb.rpc('dash_range_guarded', { from_ts: range.from, to_ts: range.to })
      .then(({ data }) => setD(data as RangeData))
  }, [range.from, range.to])

  useEffect(() => {
    sb.rpc('dash_manager').then(({ data }) => setOps(data))
    sb.from('orders')
      .select('id, order_no, status, deadline_at, quoted_total, scheduled_date, clients(name), staff!orders_master_id_fkey(full_name, avatar_path)')
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setRecent(data ?? []))
  }, [])

  const days: Point[] = useMemo(() => (d?.by_day ?? []).map((x) => ({
    label: dateShort(x.d, lang),
    value: Number(x.revenue),
    extra: nOrders(Number(x.orders), lang),
  })), [d, lang])

  const months: Point[] = useMemo(() => (d?.by_month ?? []).map((x) => ({
    label: monthName(x.m, lang),
    value: Number(x.revenue),
    extra: `${t('dash.profit')}: ${money(x.profit, lang)}`,
  })), [d, lang])

  if (!d) return <p className="empty">{t('common.loading')}</p>

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('dash.hello')}, <b>{me.full_name.split(' ')[0]}!</b></h1>
          <p className="sub">{t('dash.sub')}</p>
        </div>
        <div className="split">
          <QuietBadge />
          <Range {...range} />
        </div>
      </div>

      <NewNotice />

      <Attention />

      <div className="grid grid--4">
        <Stat label={t('dash.revenue')} value={money(d.revenue, lang)}
              trend={pct(d.revenue, d.revenue_prev)} art={days} format={(v) => money(v, lang)}
              foot={<span>{t('fin.cash')} {money(d.cash, lang)} · {t('fin.card')} {money(d.card, lang)}</span>} />
        <Stat label={t('dash.orders')} value={d.orders}
              trend={pct(d.orders, d.orders_prev)} format={(v) => String(v)}
              art={(d.by_day ?? []).map((x) => ({ label: dateShort(x.d, lang), value: Number(x.orders) }))}
              foot={<span>{t('dash.avgCheck')} {money(d.avg_check, lang)}</span>} />
        <Stat label={t('dash.company')} value={money(d.company_net, lang)}
              art={(d.by_day ?? []).map((x) => ({ label: dateShort(x.d, lang), value: Number(x.profit) }))}
              format={(v) => money(v, lang)}
              foot={<span>{t('fin.tax')} {money(d.tax, lang)}</span>} />
        <Stat label={t('fin.masters')} value={money(d.masters_paid, lang)}
              foot={<span>{t('fin.materials')} {money(d.materials, lang)}</span>} />
      </div>

      {ops && (
        <div className="grid grid--4">
          <MiniStat label={t('dash.active')} value={ops.active} to="/orders" />
          <MiniStat label={t('ord.status.offered')} value={ops.offered} to="/orders" tone={ops.offered ? 'warn' : undefined} />
          <MiniStat label={t('ord.status.new')} value={ops.unassigned} to="/orders" tone={ops.unassigned ? 'warn' : undefined} />
          <MiniStat label={t('dash.overdue')} value={ops.overdue} to="/orders" tone={ops.overdue ? 'bad' : undefined} />
        </div>
      )}

      <div className="grid grid--wide-left">
        <div className="card">
          <div className="card__head">
            <div>
              <h2 className="h2">{t('dash.revenueChart')}</h2>
              <p className="card__note">{money(d.revenue, lang)} · {nOrders(Number(d.orders), lang)}</p>
            </div>
            <span className="badge badge--ghost">{t('dash.profit')} ─ ─</span>
          </div>
          <AreaChart data={days} format={(v) => money(v, lang)}
                     secondary={{ label: t('dash.profit'), values: (d.by_day ?? []).map((x) => Number(x.profit)) }} />
        </div>

        <div className="card">
          <div className="card__head"><h2 className="h2">{t('dash.months')}</h2></div>
          <BarChart data={months} format={(v) => money(v, lang)} height={200} />
        </div>
      </div>

      <div className="grid grid--wide-right">
        <div className="card">
          <div className="card__head">
            <h2 className="h2">{t('dash.byMaster')}</h2>
            <Link className="btn btn--ghost btn--sm" to="/team">{t('nav.team')}</Link>
          </div>
          <div className="list">
            {(d.by_master ?? []).map((m) => (
              <Link className="list__row" key={m.id} to={`/team/${m.id}`}>
                <Avatar name={m.name} size="sm" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{m.name}</b>
                  <small>{nOrders(Number(m.orders), lang)}</small>
                </span>
                <span className="list__right num"><b>{money(m.share, lang)}</b></span>
              </Link>
            ))}
            {(d.by_master ?? []).length === 0 && <p className="empty">{t('common.empty')}</p>}
          </div>
        </div>

        <RecentOrders rows={recent} showMoney />
      </div>
    </>
  )
}

/* ============================== менеджер ============================== */
function ManagerView({ me }: { me: Me }) {
  const { t, lang } = useT()
  const [d, setD] = useState<any>(null)
  const [queue, setQueue] = useState<any[]>([])
  const [today, setToday] = useState<any[]>([])

  useEffect(() => {
    sb.rpc('dash_manager').then(({ data }) => setD(data))
    // Очередь: что ещё никому не отдано или ждёт ответа мастера
    sb.from('orders')
      .select('id, order_no, status, deadline_at, address, scheduled_date, scheduled_slot, urgent, clients(name, phone), staff!orders_master_id_fkey(full_name, avatar_path)')
      .in('status', ['new', 'offered']).order('deadline_at').limit(10)
      .then(({ data }) => setQueue(data ?? []))
    sb.from('orders')
      .select('id, order_no, status, deadline_at, address, scheduled_slot, clients(name), staff!orders_master_id_fkey(full_name, avatar_path)')
      .eq('scheduled_date', new Date().toISOString().slice(0, 10))
      .not('status', 'in', '("done","cancelled")').order('scheduled_slot').limit(12)
      .then(({ data }) => setToday(data ?? []))
  }, [])

  if (!d) return <p className="empty">{t('common.loading')}</p>

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('dash.hello')}, <b>{me.full_name.split(' ')[0]}!</b></h1>
          <p className="sub">{t('dash.dispatch')}</p>
        </div>
        <QuietBadge />
      </div>

      <NewNotice />

      <Attention />

      <div className="grid grid--4">
        <Stat label={t('ord.status.new')} value={d.unassigned}
              foot={<span>{t('dash.needAssign')}</span>} />
        <Stat label={t('ord.status.offered')} value={d.offered}
              foot={<span>{t('dash.acceptAvg')}: {d.accept_min} {t('dash.min')}</span>} />
        <Stat label={t('dash.active')} value={d.active}
              foot={<span>{t('dash.doneToday')}: {d.done_today}</span>} />
        <Stat label={t('dash.overdue')} value={d.overdue}
              foot={<span>{t('dash.declined')}: {d.declined}</span>} />
      </div>

      <div className="grid grid--4">
        <MiniStat label={t('dash.todayJobs')} value={d.today} to="/orders" />
        <MiniStat label={t('dash.tomorrowJobs')} value={d.tomorrow} to="/orders" />
        <MiniStat label={t('dash.newLeads')} value={d.new_leads} to="/orders" />
        <MiniStat label={t('dash.freeMasters')}
                  value={(d.crew ?? []).filter((c: any) => c.load < c.capacity).length} to="/team" />
      </div>

      <div className="grid grid--wide-left">
        <div className="card">
          <div className="card__head">
            <div><h2 className="h2">{t('dash.queue')}</h2>
              <p className="card__note">{t('dash.queueNote')}</p></div>
            <Link className="btn btn--ghost btn--sm" to="/orders">{t('common.all')}</Link>
          </div>
          <div className="list">
            {queue.map((o) => {
              const late = o.deadline_at && new Date(o.deadline_at) < new Date()
              return (
                <Link className="list__row" key={o.id} to={`/orders/${o.id}`}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b>{o.order_no} · {o.clients?.name}</b>
                    <small>{o.address ?? '—'} · {o.scheduled_date ?? ''} {o.scheduled_slot ?? ''}</small>
                  </span>
                  <span className="list__right split" style={{ justifyContent: 'flex-end' }}>
                    {o.urgent && <span className="badge badge--warn">!</span>}
                    <Status value={o.status} overdue={!!late} />
                  </span>
                </Link>
              )
            })}
            {queue.length === 0 && <p className="empty">{t('common.empty')}</p>}
          </div>
        </div>

        <CrewCard crew={d.crew ?? []} />
      </div>

      <div className="card card--flush">
        <div className="card__head" style={{ padding: '20px 22px 0' }}>
          <h2 className="h2">{t('dash.todayPlan')}</h2>
          <span className="badge badge--ghost">{today.length}</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>№</th><th>{t('ord.client')}</th><th>{t('crm.address')}</th>
              <th>{t('ord.master')}</th><th>{t('ord.when')}</th><th></th>
            </tr></thead>
            <tbody>
              {today.map((o) => (
                <tr key={o.id} data-click onClick={() => { location.hash = `#/orders/${o.id}` }}>
                  <td className="num"><b>{o.order_no}</b></td>
                  <td>{o.clients?.name ?? '—'}</td>
                  <td className="muted">{o.address ?? '—'}</td>
                  <td>{o.staff?.full_name ?? <span className="muted">{t('common.none')}</span>}</td>
                  <td className="num">{o.scheduled_slot ?? dateShort(o.deadline_at, lang)}</td>
                  <td className="right"><Status value={o.status}
                      overdue={o.deadline_at ? new Date(o.deadline_at) < new Date() : false} /></td>
                </tr>
              ))}
              {today.length === 0 && <tr><td colSpan={6}><p className="empty">{t('common.empty')}</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ================================ мастер ================================ */
function MasterView({ me }: { me: Me }) {
  const { t, lang } = useT()
  const [d, setD] = useState<any>(null)
  const [mine, setMine] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])

  const load = () => {
    sb.rpc('dash_master').then(({ data }) => setD(data))
    sb.from('orders')
      .select('id, order_no, status, deadline_at, quoted_total, address, district, lat, lon, scheduled_date, scheduled_slot, clients(name, phone)')
      .eq('master_id', me.id).not('status', 'in', '("done","cancelled")')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('deadline_at').limit(10)
      .then(({ data }) => setMine(data ?? []))
    sb.from('order_offers')
      .select('id, expires_at, orders(id, order_no, address, quoted_total, scheduled_date, scheduled_slot)')
      .eq('status', 'pending').gt('expires_at', new Date().toISOString())
      .then(({ data }) => setOffers(data ?? []))
  }
  useEffect(load, [me.id])

  async function answer(id: string, yes: boolean) {
    if (yes) await sb.rpc('accept_offer', { f_id: id })
    else await sb.rpc('decline_offer', { f_id: id, why: null })
    load()
  }

  if (!d) return <p className="empty">{t('common.loading')}</p>
  const days: Point[] = (d.by_day ?? []).map((x: any) => ({
    label: dateShort(x.d, lang), value: Number(x.revenue),
  }))
  // Ближайший по расписанию заказ, который ещё не закрыт
  const next = mine.find((o) => ['assigned', 'en_route', 'shopping', 'in_progress'].includes(o.status))

  return (
    <>
      <NewJobBanner offers={offers} onAnswer={answer} />

      {next && <NextJob order={next} myId={me.id} />}

      <div className="page__head">
        <div>
          <h1 className="h1">{t('dash.hello')}, <b>{me.full_name.split(' ')[0]}!</b></h1>
          <p className="sub">{t('dash.myOrders')}</p>
        </div>
      </div>

      <div className="grid grid--4">
        <Stat label={t('dash.myMonth')} value={money(d.month_share, lang)}
              trend={pct(d.month_share, d.prev_share)} art={days} format={(v) => money(v, lang)} />
        <Stat label={t('prof.done')} value={d.month_orders} foot={<span>{t('prof.thisMonth')}</span>} />
        <Stat label={t('dash.active')} value={d.active} />
        <Stat label={t('dash.overdue')} value={d.overdue} />
      </div>


      <div className="grid grid--wide-right">
        <div className="card">
          <div className="card__head"><h2 className="h2">{t('prof.earned')}</h2></div>
          <AreaChart data={days} format={(v) => money(v, lang)} height={190} />
        </div>
        <RecentOrders rows={mine} showMoney title={t('dash.myOrders')} />
      </div>
    </>
  )
}

/* ============================== кусочки ============================== */
/** Ночью предложения не рассылаются — офису важно понимать, почему
 *  заказ висит новым, а не искать поломку. */
function QuietBadge() {
  const { t } = useT()
  const [w, setW] = useState<any>(null)
  useEffect(() => { sb.rpc('dispatch_window').then(({ data }) => setW(data)) }, [])
  if (!w) return null
  if (!w.quiet) {
    return <span className="badge badge--ghost">{t('ord.answerIn')}: {w.ttl_min} {t('dash.min')}</span>
  }
  return (
    <span className="badge badge--warn">
      <i className="dot" />
      {t('ord.quiet').replace('{from}', String(w.quiet_to).slice(0, 5))}
    </span>
  )
}

function MiniStat({ label, value, to, tone }: { label: string; value: number; to: string; tone?: 'warn' | 'bad' }) {
  return (
    <Link className="card mini" to={to} data-tone={tone}>
      <span className="mini__label">{label}</span>
      <b className="mini__value num">{value}</b>
    </Link>
  )
}

function CrewCard({ crew }: { crew: any[] }) {
  const { t, lang } = useT()
  return (
    <div className="card">
      <div className="card__head">
        <div><h2 className="h2">{t('dash.load')}</h2>
          <p className="card__note">
            {crew.reduce((a, c) => a + c.load, 0)} / {crew.reduce((a, c) => a + c.capacity, 0)}
          </p></div>
        <Link className="btn btn--ghost btn--sm" to="/team">{t('nav.team')}</Link>
      </div>
      <div className="list">
        {crew.map((c) => {
          const share = c.capacity ? Math.min(100, (c.load / c.capacity) * 100) : 0
          return (
            <Link className="list__row" key={c.id} to={`/team/${c.id}`}>
              <Avatar name={c.full_name} path={c.avatar_path} size="sm" />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b>{c.full_name}</b>
                <small>
                  {c.seen_at ? fromNow(c.seen_at, lang) : t('dash.noSignal')}
                  {c.today != null && ` · ${t('common.today')}: ${c.today}`}
                  {c.pending ? ` · ${t('dash.pendingOffers').toLowerCase()}: ${c.pending}` : ''}
                </small>
                <span className={`progress ${share >= 100 ? 'progress--bad' : share >= 70 ? 'progress--warn' : ''}`}
                      style={{ marginTop: 6 }}>
                  <i style={{ width: `${share}%` }} />
                </span>
              </span>
              <span className="list__right num"><b>{c.load}/{c.capacity}</b></span>
            </Link>
          )
        })}
        {crew.length === 0 && <p className="empty">{t('common.empty')}</p>}
      </div>
    </div>
  )
}

function RecentOrders({ rows, showMoney, title }: { rows: any[]; showMoney?: boolean; title?: string }) {
  const { t, lang } = useT()
  return (
    <div className="card card--flush">
      <div className="card__head" style={{ padding: '20px 22px 0' }}>
        <h2 className="h2">{title ?? t('dash.recent')}</h2>
        <Link className="btn btn--ghost btn--sm" to="/orders">{t('common.all')}</Link>
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr>
            <th>№</th><th>{t('ord.client')}</th><th>{t('ord.master')}</th>
            <th>{t('ord.when')}</th>{showMoney && <th className="right">{t('ord.sum')}</th>}<th></th>
          </tr></thead>
          <tbody>
            {rows.map((o: any) => (
              <tr key={o.id} data-click onClick={() => { location.hash = `#/orders/${o.id}` }}>
                <td className="num"><b>{o.order_no}</b></td>
                <td>{o.clients?.name ?? '—'}</td>
                <td>{o.staff?.full_name ?? <span className="muted">{t('common.none')}</span>}</td>
                <td className="num">{dateShort(o.scheduled_date ?? o.deadline_at, lang)}</td>
                {showMoney && <td className="right num">{money(o.quoted_total, lang)}</td>}
                <td className="right"><Status value={o.status}
                    overdue={o.deadline_at ? new Date(o.deadline_at) < new Date() : false} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><p className="empty">{t('common.empty')}</p></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
