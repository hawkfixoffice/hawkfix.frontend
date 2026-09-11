import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, fromNow } from '../lib/fmt'
import Avatar from '../ui/Avatar'
import Modal from '../ui/Modal'

/** Команда: карточки людей с загрузкой и умениями. Клик открывает
 *  карточку сотрудника — там деньги по месяцам, все заказы и настройки. */
export default function Team({ me }: { me: Me }) {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [groups, setGroups] = useState<{ key: string; name: string }[]>([])
  const [loads, setLoads] = useState<Record<string, number>>({})
  const [money30, setMoney30] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [onlyActive, setOnlyActive] = useState(false)
  const [add, setAdd] = useState(false)

  const load = () => {
    sb.from('staff').select('*, staff_skills(group_key), staff_locations(updated_at)')
      .order('role').then(({ data }) => setRows(data ?? []))
    sb.from('price_groups').select('key, price_group_tr(name, locale)').then(({ data }) => {
      setGroups((data ?? []).map((g: any) => ({
        key: g.key,
        name: g.price_group_tr?.find((x: any) => x.locale === (lang === 'ru' ? 'ru' : 'pl'))?.name ?? g.key,
      })))
    })
    // Загрузка: считаем незакрытые заказы по мастерам одним запросом
    sb.from('orders').select('master_id, status')
      .in('status', ['assigned', 'en_route', 'shopping', 'in_progress'])
      .then(({ data }) => {
        const acc: Record<string, number> = {}
        ;(data ?? []).forEach((o: any) => { if (o.master_id) acc[o.master_id] = (acc[o.master_id] ?? 0) + 1 })
        setLoads(acc)
      })
    if (me.role === 'admin') {
      sb.from('order_reports').select('master_id, master_share')
        .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
        .then(({ data }) => {
          const acc: Record<string, number> = {}
          ;(data ?? []).forEach((r: any) => { acc[r.master_id] = (acc[r.master_id] ?? 0) + Number(r.master_share) })
          setMoney30(acc)
        })
    }
  }
  useEffect(load, [lang, me.role])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((r) =>
      (role === 'all' || r.role === role) &&
      (!onlyActive || r.active) &&
      (!s || [r.full_name, r.username, r.phone].filter(Boolean).some((v: string) => v.toLowerCase().includes(s))))
  }, [rows, q, role, onlyActive])

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('team.title')}</h1>
          <p className="sub">{list.length} / {rows.length}</p>
        </div>
        <div className="split">
          <div className="field" style={{ minWidth: 240 }}>
            <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {me.role === 'admin' && <button className="btn btn--primary" onClick={() => setAdd(true)}>+ {t('team.add')}</button>}
        </div>
      </div>

      <div className="chips">
        {['all', 'master', 'manager', 'admin'].map((r) => (
          <button key={r} className="chip" data-on={role === r || undefined} onClick={() => setRole(r)}>
            {r === 'all' ? t('common.all') : t(`team.${r}`)}
          </button>
        ))}
        <button className="chip" data-on={onlyActive || undefined} onClick={() => setOnlyActive((v) => !v)}>
          {t('team.active')}
        </button>
      </div>

      <div className="grid grid--3">
        {list.map((s) => {
          const load = loads[s.id] ?? 0
          const share = s.capacity ? Math.min(100, (load / s.capacity) * 100) : 0
          const seen = s.staff_locations?.[0]?.updated_at ?? s.staff_locations?.updated_at
          return (
            <div className="card person" key={s.id} onClick={() => nav(`/team/${s.id}`)} role="button" tabIndex={0}
                 onKeyDown={(e) => e.key === 'Enter' && nav(`/team/${s.id}`)}>
              <div className="split">
                <Avatar name={s.full_name} path={s.avatar_path} />
                <span style={{ minWidth: 0 }}>
                  <b>{s.full_name}</b>
                  <small className="muted" style={{ display: 'block' }}>
                    @{s.username}{s.phone ? ` · ${s.phone}` : ''}
                  </small>
                </span>
                <span className="spacer badge badge--ghost">{t(`team.${s.role}`)}</span>
              </div>

              {s.role === 'master' && (
                <>
                  <div className="split" style={{ marginTop: 14 }}>
                    <span className="muted tiny">{t('team.load')}</span>
                    <b className="spacer num">{load}/{s.capacity}</b>
                  </div>
                  <span className={`progress ${share >= 100 ? 'progress--bad' : share >= 70 ? 'progress--warn' : ''}`}>
                    <i style={{ width: `${share}%` }} />
                  </span>
                  <p className="tiny muted" style={{ margin: '8px 0 0' }}>
                    {seen ? `${t('dash.masters')} · ${fromNow(seen, lang)}` : t('dash.noSignal')}
                    {me.role === 'admin' && money30[s.id] != null && ` · ${money(money30[s.id], lang)} / 30 d`}
                  </p>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {(s.staff_skills ?? []).slice(0, 4).map((k: any) => (
                      <span className="chip" key={k.group_key}>
                        {groups.find((g) => g.key === k.group_key)?.name?.split(':')[0] ?? k.group_key}
                      </span>
                    ))}
                    {(s.staff_skills ?? []).length > 4 && (
                      <span className="chip">+{(s.staff_skills ?? []).length - 4}</span>
                    )}
                    {(s.staff_skills ?? []).length === 0 && <span className="muted tiny">{t('common.empty')}</span>}
                  </div>
                </>
              )}

              <div className="split" style={{ marginTop: 14 }}>
                <Link className="btn btn--ghost btn--sm" to={`/team/${s.id}`} onClick={(e) => e.stopPropagation()}>
                  {t('prof.openCard')}
                </Link>
                <span className={`spacer badge ${s.active ? 'badge--mint' : 'badge--warn'}`}>
                  {s.active ? t('team.active') : t('team.off')}
                </span>
              </div>
            </div>
          )
        })}
        {list.length === 0 && <p className="empty">{t('common.empty')}</p>}
      </div>

      {add && <StaffForm groups={groups} onClose={() => setAdd(false)} onDone={() => { setAdd(false); load() }} />}
    </>
  )
}

function StaffForm({ groups, onClose, onDone }: { groups: any[]; onClose: () => void; onDone: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({ username: '', full_name: '', role: 'master', phone: '', capacity: 3, password: '' })
  const [skills, setSkills] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await sb.rpc('create_staff', {
      p_username: f.username, p_password: f.password, p_full_name: f.full_name,
      p_role: f.role, p_phone: f.phone || null, p_capacity: Number(f.capacity), p_skills: skills,
    })
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <Modal title={t('team.add')} onClose={onClose}>
      <form onSubmit={submit} className="grid">
        <div className="grid grid--2">
          <div className="field"><label>{t('login.user')}</label>
            <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required /></div>
          <div className="field"><label>{t('team.password')}</label>
            <input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} /></div>
        </div>
        <div className="field"><label>{t('team.fullName')}</label>
          <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })}
                 placeholder="Jan Kowalski" required /></div>
        <div className="grid grid--2">
          <div className="field"><label>{t('team.role')}</label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="master">{t('team.master')}</option>
              <option value="manager">{t('team.manager')}</option>
              <option value="admin">{t('team.admin')}</option>
            </select></div>
          <div className="field"><label>{t('team.capacity')}</label>
            <input type="number" min={0} max={12} value={f.capacity}
                   onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></div>
        </div>
        <div className="field"><label>{t('crm.phone')}</label>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+48 …" /></div>

        {f.role === 'master' && (
          <div className="field">
            <span className="flabel">{t('team.skills')}</span>
            <div className="chips">
              {groups.map((g) => (
                <button type="button" key={g.key} className="chip" data-on={skills.includes(g.key) || undefined}
                        onClick={() => setSkills((s) => s.includes(g.key) ? s.filter((x) => x !== g.key) : [...s, g.key])}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="err">{err}</p>}
        <div className="split">
          <button className="btn btn--primary" disabled={busy}>{busy ? <span className="spin" /> : t('common.save')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}
