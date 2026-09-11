import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, dateShort } from '../lib/fmt'
import Stat from '../ui/Stat'
import { AreaChart, BarChart } from '../ui/Chart'

/** Деньги фирмы: сколько прошло через кассу, сколько ушло мастерам,
 *  сколько осталось после налога. Виден только администратору —
 *  вкладка не отдаётся ни менеджеру, ни мастеру. */
export default function Finance() {
  const { t, lang } = useT()
  const [rows, setRows] = useState<any[]>([])
  const [days, setDays] = useState(90)
  // Ошибку показываем словами: молчаливая пустая страница выглядит как
  // «денег нет», хотя на деле это сломанный запрос
  const [err, setErr] = useState('')

  useEffect(() => {
    const from = new Date(Date.now() - days * 864e5).toISOString()
    sb.from('order_reports')
      .select('*, orders(order_no, scheduled_date), staff!order_reports_master_id_fkey(id, full_name)')
      .gte('created_at', from).order('created_at', { ascending: false })
      .then(({ data, error }) => { setRows(data ?? []); setErr(error?.message ?? '') })
  }, [days])

  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const gross = sum('gross'), masters = sum('master_share'), materials = sum('materials_cost')
  const company = sum('company_share'), tax = sum('tax_amount'), net = sum('company_net')
  const cash = sum('cash_amount'), card = sum('card_amount')

  // по мастерам
  const byMaster = Object.values(rows.reduce((acc: any, r) => {
    const k = r.staff?.id ?? '—'
    acc[k] ??= { name: r.staff?.full_name ?? '—', n: 0, gross: 0, share: 0 }
    acc[k].n += 1; acc[k].gross += Number(r.gross); acc[k].share += Number(r.master_share)
    return acc
  }, {})) as { name: string; n: number; gross: number; share: number }[]

  // по дням
  const byDay = Object.entries(rows.reduce((acc: any, r) => {
    const d = String(r.created_at).slice(0, 10)
    acc[d] = (acc[d] ?? 0) + Number(r.gross); return acc
  }, {})).sort().map(([d, v]) => ({ label: dateShort(d, lang), value: Number(v) }))

  return (
    <>
      <div className="page__head">
        <div><h1 className="h1">{t('fin.title')}</h1><p className="sub">{rows.length} {t('ord.done').toLowerCase()}</p></div>
        <div className="chips">
          {[30, 90, 365].map((d) => (
            <button key={d} className="chip" data-on={days === d || undefined} onClick={() => setDays(d)}>{d} d</button>
          ))}
        </div>
      </div>

      <div className="grid grid--4">
        <Stat label={t('fin.gross')} value={money(gross, lang)}
              foot={<span>{t('fin.cash')} {money(cash, lang)} · {t('fin.card')} {money(card, lang)}</span>} />
        <Stat label={t('fin.masters')} value={money(masters, lang)} />
        <Stat label={t('fin.materials')} value={money(materials, lang)} />
        <Stat label={t('fin.net')} value={money(net, lang)}
              foot={<span>{t('fin.company')} {money(company, lang)} · {t('fin.tax')} {money(tax, lang)}</span>} />
      </div>

      <div className="grid grid--wide-left">
        <div className="card">
          <div className="card__head"><h2 className="h2">{t('fin.byMonth')}</h2></div>
          <AreaChart data={byDay} format={(v) => money(v, lang)} />
        </div>
        <div className="card">
          <div className="card__head"><h2 className="h2">{t('fin.byMaster')}</h2></div>
          <BarChart data={byMaster.map((m) => ({ label: m.name.split(' ')[0], value: m.share }))}
                    format={(v) => money(v, lang)} height={200} />
          <div className="list" style={{ marginTop: 10 }}>
            {byMaster.map((m) => (
              <div className="list__row" key={m.name}>
                <span style={{ flex: 1, minWidth: 0 }}><b>{m.name}</b><small>{m.n} × {t('ord.done').toLowerCase()}</small></span>
                <span className="list__right num"><b>{money(m.share, lang)}</b><small className="muted">{money(m.gross, lang)}</small></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="card card--flush">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>№</th><th>{t('ord.master')}</th><th>{t('fin.cash')}</th><th>{t('fin.card')}</th>
              <th>{t('ord.materials')}</th><th className="right">{t('ord.masterEarns')}</th>
              <th className="right">{t('fin.company')}</th><th className="right">{t('fin.net')}</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-click onClick={() => { location.hash = `#/orders/${r.order_id}` }}>
                  <td className="num"><b>{r.orders?.order_no}</b></td>
                  <td>{r.staff?.full_name}</td>
                  <td className="num">{money(r.cash_amount, lang)}</td>
                  <td className="num">{money(r.card_amount, lang)}</td>
                  <td className="num">{r.no_materials ? '—' : money(r.materials_cost, lang)}</td>
                  <td className="right num" style={{ color: 'var(--accent-text)' }}>{money(r.master_share, lang)}</td>
                  <td className="right num">{money(r.company_share, lang)}</td>
                  <td className="right num"><b>{money(r.company_net, lang)}</b></td>
                  <td className="right muted num tiny">{dateShort(r.created_at, lang)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9}><p className="empty">{t('common.empty')}</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
