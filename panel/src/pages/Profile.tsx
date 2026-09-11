import { useEffect, useState } from 'react'
import { sb, type Me } from '../lib/supabase'
import { useT, LANGS } from '../lib/i18n'
import { money, dateShort, monthName, nOrders } from '../lib/fmt'
import Stat from '../ui/Stat'
import Avatar from '../ui/Avatar'
import AvatarPicker from '../ui/AvatarPicker'
import { BarChart, type Point } from '../ui/Chart'
import Activity from '../ui/Activity'

/** Профиль. Мастер видит здесь свой заработок — 80 % от работ, без цифр
 *  фирмы: они его не касаются. У менеджера и админа заработка нет, у них
 *  другая мера работы — часы в панели и заказы, которые они вели. */
export default function Profile({ me }: { me: Me }) {
  const { t, lang, setLang } = useT()
  const [stats, setStats] = useState<any>(null)
  const [full, setFull] = useState<any>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState('')
  const [skills, setSkills] = useState<string[]>([])

  useEffect(() => {
    sb.from('staff').select('avatar_path').eq('id', me.id).maybeSingle()
      .then(({ data }) => setAvatar(data?.avatar_path ?? null))
    if (me.role === 'master') {
      // Своя помесячная картина: сколько заказов и сколько заработал
      sb.rpc('master_stats', { m_id: me.id, months: 12 }).then(({ data }) => setFull(data))
      sb.rpc('dash_master').then(({ data }) => setStats(data))
      // my_reports — представление без долей фирмы: мастеру их знать незачем
      sb.from('my_reports')
        .select('id, order_id, created_at, master_share, materials_cost, gross, order_no')
        .order('created_at', { ascending: false }).limit(30)
        .then(({ data }) => setHistory(data ?? []))
      sb.from('staff_skills').select('group_key').eq('staff_id', me.id)
        .then(({ data }) => setSkills((data ?? []).map((x: any) => x.group_key)))
    }
  }, [me.id, me.role])

  async function changePass(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await sb.rpc('set_staff_password', { p_staff: me.id, p_password: pass })
    setMsg(error ? error.message : t('common.save'))
    setPass('')
  }

  return (
    <>
      <div className="page__head">
        <div className="split">
          <Avatar name={me.full_name} path={avatar} size="lg" />
          <div>
            <h1 className="h1">{me.full_name}</h1>
            <p className="sub">@{me.username} · {t(`team.${me.role}`)}{me.phone ? ` · ${me.phone}` : ''}</p>
          </div>
        </div>
      </div>

      {me.role !== 'master' && <Activity staffId={me.id} />}

      {me.role === 'master' && stats && (
        <div className="grid grid--4">
          <Stat label={t('prof.thisMonth')} value={money(stats.month_share, lang)} />
          <Stat label={t('prof.done')} value={stats.month_orders} />
          <Stat label={t('dash.active')} value={stats.active} />
          <Stat label={t('dash.overdue')} value={stats.overdue} />
        </div>
      )}

      <div className="grid grid--2">
        <form className="card" onSubmit={changePass}>
          <div className="card__head"><h2 className="h2">{t('prof.changePass')}</h2></div>
          <div className="field">
            <label>{t('team.password')}</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </div>
          {msg && <p className="muted tiny">{msg}</p>}
          <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} disabled={pass.length < 8}>
            {t('common.save')}
          </button>
        </form>

        <div className="card">
          <div className="card__head"><h2 className="h2">{t('prof.lang')}</h2></div>
          <div className="chips">
            {LANGS.map((l) => (
              <button key={l} className="chip" data-on={l === lang || undefined} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <hr className="hr" />
          <AvatarPicker staffId={me.id} name={me.full_name} path={avatar}
                        onDone={(p) => setAvatar(p)} />

          {me.role === 'master' && skills.length > 0 && (
            <>
              <hr className="hr" />
              <h3 className="h2" style={{ fontSize: '0.95rem' }}>{t('team.skills')}</h3>
              <div className="chips" style={{ marginTop: 8 }}>
                {skills.map((s) => <span className="chip" key={s}>{s.replace(/^g-/, '')}</span>)}
              </div>
            </>
          )}
        </div>
      </div>

      {me.role === 'master' && full && (
        <>
          <div className="grid grid--4">
            <Stat label={t('prof.allTime')} value={money(full.total_share, lang)}
                  foot={<span>{t('fin.gross')} {money(full.total_gross, lang)}</span>} />
            <Stat label={t('prof.done')} value={full.total_orders}
                  foot={<span>{t('prof.avg')} {money(full.avg_check, lang)}</span>} />
            <Stat label={t('prof.clients')} value={full.clients} />
            <Stat label={t('ord.materials')} value={money(full.materials, lang)} />
          </div>

          <div className="card">
            <div className="card__head">
              <div><h2 className="h2">{t('prof.months')}</h2>
                <p className="card__note">{t('prof.earned')}</p></div>
            </div>
            <BarChart height={230} format={(v) => money(v, lang)}
                      data={(full.by_month ?? []).map((x: any): Point => ({
                        label: monthName(x.m, lang),
                        value: Number(x.share),
                        extra: `${nOrders(Number(x.orders), lang)} · ${money(x.gross, lang)}`,
                      }))} />
          </div>
        </>
      )}

      {me.role === 'master' && (
        <div className="card card--flush">
          <div className="card__head" style={{ padding: '20px 22px 0' }}><h2 className="h2">{t('prof.earned')}</h2></div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>№</th><th>{t('ord.when')}</th><th className="right">{t('ord.materials')}</th>
                <th className="right">{t('prof.earned')}</th></tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} data-click onClick={() => { location.hash = `#/orders/${r.order_id}` }}>
                    <td className="num"><b>{r.order_no}</b></td>
                    <td className="num muted">{dateShort(r.created_at, lang)}</td>
                    <td className="right num muted">{money(r.materials_cost, lang)}</td>
                    <td className="right num"><b style={{ color: 'var(--accent-text)' }}>{money(r.master_share, lang)}</b></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={4}><p className="empty">{t('common.empty')}</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
