import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort, monthName, dateFull, nOrders } from '../lib/fmt'
import Stat from '../ui/Stat'
import Avatar from '../ui/Avatar'
import AvatarPicker from '../ui/AvatarPicker'
import Status from '../ui/Status'
import { BarChart, type Point } from '../ui/Chart'
import Activity from '../ui/Activity'

/** Карточка сотрудника: сколько заработал по месяцам, все его заказы,
 *  умения, загрузка и заметка. Деньги видит только администратор —
 *  менеджеру эта страница показывает занятость и заказы. */
export default function StaffCard({ me }: { me: Me }) {
  const { id = '' } = useParams()
  const { t, lang } = useT()
  const [s, setS] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [groups, setGroups] = useState<{ key: string; name: string }[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [capacity, setCapacity] = useState(3)
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState('')

  const canEdit = me.role === 'admin'
  /** Деньги есть только у того, кто ездит: у менеджера и админа нет ни
   *  отчётов, ни доли — пустые денежные блоки в их карточке бессмысленны. */
  const isField = s?.role === 'master'
  const canSeeMoney = isField && (me.role === 'admin' || me.id === id)

  const load = () => {
    sb.from('staff').select('*, staff_skills(group_key)').eq('id', id).maybeSingle()
      .then(({ data }) => {
        setS(data)
        setNote(data?.note ?? '')
        setCapacity(data?.capacity ?? 3)
        setSkills((data?.staff_skills ?? []).map((x: any) => x.group_key))
      })
    sb.from('staff').select('role').eq('id', id).maybeSingle().then(({ data }) => {
      if (data?.role === 'master' && (me.role === 'admin' || me.id === id)) {
        sb.rpc('master_stats', { m_id: id, months: 12 }).then(({ data }) => setStats(data))
      } else setStats(null)
    })
    sb.from('orders')
      .select('id, order_no, status, scheduled_date, deadline_at, quoted_total, address, clients(name), order_reports(gross, master_share)')
      .eq('master_id', id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setOrders(data ?? []))
    sb.from('price_groups').select('key, price_group_tr(name, locale)')
      .then(({ data }) => setGroups((data ?? []).map((g: any) => ({
        key: g.key,
        name: g.price_group_tr?.find((x: any) => x.locale === (lang === 'ru' ? 'ru' : 'pl'))?.name ?? g.key,
      }))))
  }
  useEffect(load, [id, lang])

  if (!s) return <p className="empty">{t('common.loading')}</p>

  const byMonth: Point[] = (stats?.by_month ?? []).map((x: any) => ({
    label: monthName(x.m, lang),
    value: Number(x.share),
    extra: `${nOrders(Number(x.orders), lang)} · ${money(x.gross, lang)}`,
  }))

  async function save() {
    setMsg('')
    await sb.from('staff').update({ capacity: Number(capacity), note }).eq('id', id)
    await sb.from('staff_skills').delete().eq('staff_id', id)
    if (skills.length) await sb.from('staff_skills').insert(skills.map((g) => ({ staff_id: id, group_key: g })))
    if (pass) {
      const { error } = await sb.rpc('set_staff_password', { p_staff: id, p_password: pass })
      if (error) { setMsg(error.message); return }
      setPass('')
    }
    setMsg(t('common.save'))
    load()
  }

  return (
    <>
      <div className="page__head">
        <div className="split">
          <Avatar name={s.full_name} path={s.avatar_path} size="xl" />
          <div>
            <Link className="btn btn--ghost btn--sm" to="/team">← {t('team.title')}</Link>
            <h1 className="h1" style={{ marginTop: 8 }}>{s.full_name}</h1>
            <p className="sub">
              @{s.username} · {t(`team.${s.role}`)}{s.phone ? ` · ${s.phone}` : ''}
              {s.role === 'master' ? ` · ${t('team.capacity')}: ${s.capacity}` : ''} ·{' '}
              {dateFull(s.hired_at, lang)}
            </p>
          </div>
        </div>
        <span className={`badge ${s.active ? 'badge--mint' : 'badge--warn'}`}>
          {s.active ? t('team.active') : t('team.off')}
        </span>
      </div>

      {canSeeMoney && stats && (
        <div className="grid grid--4">
          <Stat label={t('prof.thisMonth')} value={money(stats.month_share, lang)}
                art={byMonth} format={(v) => money(v, lang)} />
          <Stat label={t('prof.allTime')} value={money(stats.total_share, lang)}
                foot={<span>{t('fin.gross')} {money(stats.total_gross, lang)}</span>} />
          <Stat label={t('prof.done')} value={stats.total_orders}
                foot={<span>{t('prof.avg')} {money(stats.avg_check, lang)}</span>} />
          <Stat label={t('prof.clients')} value={stats.clients}
                foot={<span>{t('dash.active')}: {stats.active} · {t('dash.overdue')}: {stats.overdue}</span>} />
        </div>
      )}

      {!isField && <Activity staffId={id} />}

      <div className="grid grid--wide-left">
        {canSeeMoney && (
          <div className="card">
            <div className="card__head">
              <div><h2 className="h2">{t('prof.months')}</h2>
                <p className="card__note">{t('prof.earned')} · {money(stats?.total_share, lang)}</p></div>
            </div>
            <BarChart data={byMonth} format={(v) => money(v, lang)} height={230} />
          </div>
        )}

        <div className="card">
          <div className="card__head"><h2 className="h2">{isField ? t('team.skills') : t('nav.profile')}</h2></div>
          {isField && <div className="chips">
            {groups.map((g) => (
              <button key={g.key} type="button" className="chip"
                      data-on={skills.includes(g.key) || undefined}
                      disabled={!canEdit}
                      onClick={() => canEdit && setSkills((v) => v.includes(g.key) ? v.filter((x) => x !== g.key) : [...v, g.key])}>
                {g.name}
              </button>
            ))}
          </div>}

          {canEdit && (
            <>
              {isField && <hr className="hr" />}
              <div className="grid grid--2">
                {isField && <div className="field">
                  <label>{t('team.capacity')}</label>
                  <input type="number" min={0} max={12} value={capacity}
                         onChange={(e) => setCapacity(Number(e.target.value))} />
                </div>}
                <div className="field">
                  <label>{t('prof.changePass')}</label>
                  <input type="text" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="********" />
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>{t('prof.note')}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="split" style={{ marginTop: 12 }}>
                <button className="btn btn--primary btn--sm" onClick={save}>{t('common.save')}</button>
                <button className="btn btn--ghost btn--sm"
                        onClick={() => sb.from('staff').update({ active: !s.active }).eq('id', id).then(load)}>
                  {s.active ? t('team.off') : t('team.active')}
                </button>
                {msg && <span className="muted tiny">{msg}</span>}
              </div>
              <hr className="hr" />
              <AvatarPicker staffId={id} name={s.full_name} path={s.avatar_path} onDone={load} />
            </>
          )}
        </div>
      </div>

      {canSeeMoney && stats?.by_group?.length > 0 && (
        <div className="card">
          <div className="card__head"><h2 className="h2">{t('dash.topServices')}</h2></div>
          <BarChart height={170}
                    data={stats.by_group.map((g: any) => ({
                      label: groups.find((x) => x.key === g.group_key)?.name?.split(' ')[0] ?? g.group_key,
                      value: Number(g.n),
                    }))} />
        </div>
      )}

      {isField && <div className="card card--flush">
        <div className="card__head" style={{ padding: '20px 22px 0' }}>
          <h2 className="h2">{t('crm.history')}</h2>
          <span className="badge badge--ghost">{orders.length}</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>№</th><th>{t('ord.client')}</th><th>{t('crm.address')}</th><th>{t('ord.when')}</th>
              {canSeeMoney && <th className="right">{t('ord.sum')}</th>}
              {canSeeMoney && <th className="right">{t('ord.masterEarns')}</th>}
              <th></th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-click onClick={() => { location.hash = `#/orders/${o.id}` }}>
                  <td className="num"><b>{o.order_no}</b></td>
                  <td>{o.clients?.name ?? '—'}</td>
                  <td className="muted">{o.address ?? '—'}</td>
                  <td className="num">{dateShort(o.scheduled_date ?? o.deadline_at, lang)}</td>
                  {canSeeMoney && <td className="right num">{money(o.order_reports?.[0]?.gross ?? o.quoted_total, lang)}</td>}
                  {canSeeMoney && <td className="right num" style={{ color: 'var(--accent-text)' }}>
                    {o.order_reports?.[0] ? money(o.order_reports[0].master_share, lang) : '—'}</td>}
                  <td className="right"><Status value={o.status}
                      overdue={o.deadline_at ? new Date(o.deadline_at) < new Date() && o.status !== 'done' : false} /></td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7}><p className="empty">{t('common.empty')}</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
    </>
  )
}
