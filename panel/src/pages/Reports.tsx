import { useEffect, useMemo, useState } from 'react'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, money2, dateFull, dateShort, monthName, nOrders } from '../lib/fmt'
import Range, { useRange } from '../ui/Range'
import { BarChart, type Point } from '../ui/Chart'

type Kind = 'finance' | 'masters' | 'clients' | 'tax' | 'orders'

/** Отчёты: то, что бухгалтер попросит в конце месяца, и то, что нужно
 *  для разговора с мастером или клиентом. Считается из закрытых заказов,
 *  выгружается в CSV и печатается на бумагу. */
export default function Reports({ me }: { me: Me }) {
  const { t, lang } = useT()
  const range = useRange()
  const [kind, setKind] = useState<Kind>('finance')
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setBusy(true)
    sb.from('order_reports')
      .select('*, orders(order_no, scheduled_date, finished_at, address, district, items, urgent, clients(id, name, phone, status)), staff!order_reports_master_id_fkey(id, full_name)')
      .gte('created_at', range.from).lt('created_at', range.to)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => { setRows(data ?? []); setErr(error?.message ?? ''); setBusy(false) })
  }, [range.from, range.to])

  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const totals = {
    gross: sum('gross'), master: sum('master_share'), company: sum('company_share'),
    tax: sum('tax_amount'), net: sum('company_net'), materials: sum('materials_cost'),
    cash: sum('cash_amount'), card: sum('card_amount'), count: rows.length,
  }

  /* ---------- разрезы ---------- */
  const byMaster = useMemo(() => Object.values(rows.reduce((acc: any, r) => {
    const k = r.staff?.id ?? '—'
    acc[k] ??= { id: k, name: r.staff?.full_name ?? '—', orders: 0, gross: 0, share: 0, materials: 0 }
    acc[k].orders += 1; acc[k].gross += Number(r.gross)
    acc[k].share += Number(r.master_share); acc[k].materials += Number(r.materials_cost)
    return acc
  }, {})) as any[], [rows])

  const byClient = useMemo(() => Object.values(rows.reduce((acc: any, r) => {
    const c = r.orders?.clients
    const k = c?.id ?? '—'
    acc[k] ??= { id: k, name: c?.name ?? '—', phone: c?.phone ?? '', status: c?.status ?? '', orders: 0, gross: 0 }
    acc[k].orders += 1; acc[k].gross += Number(r.gross)
    return acc
  }, {})).sort((a: any, b: any) => b.gross - a.gross) as any[], [rows])

  const byMonth = useMemo(() => Object.entries(rows.reduce((acc: any, r) => {
    const m = String(r.created_at).slice(0, 7)
    acc[m] ??= { gross: 0, net: 0, tax: 0, orders: 0 }
    acc[m].gross += Number(r.gross); acc[m].net += Number(r.company_net)
    acc[m].tax += Number(r.tax_amount); acc[m].orders += 1
    return acc
  }, {})).sort() as [string, any][], [rows])

  /* ---------- выгрузка ---------- */
  function download(name: string, table: (string | number)[][]) {
    // Точка с запятой и BOM: так Excel с польской локалью открывает
    // файл сразу колонками, а не одной строкой
    const csv = '﻿' + table.map((r) => r.map((c) => {
      const v = String(c ?? '')
      return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `hawkfix-${name}-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    if (kind === 'masters') {
      download('mistrzowie', [
        [t('ord.master'), t('dash.orders'), t('fin.gross'), t('ord.masterEarns'), t('ord.materials')],
        ...byMaster.map((m) => [m.name, m.orders, m.gross.toFixed(2), m.share.toFixed(2), m.materials.toFixed(2)]),
        [t('fin.net'), totals.count, totals.gross.toFixed(2), totals.master.toFixed(2), totals.materials.toFixed(2)],
      ])
    } else if (kind === 'clients') {
      download('klienci', [
        [t('ord.client'), t('crm.phone'), t('crm.orders'), t('crm.spent'), t('common.all')],
        ...byClient.map((c) => [c.name, c.phone, c.orders, c.gross.toFixed(2), c.status]),
      ])
    } else if (kind === 'tax') {
      download('podatek', [
        [t('common.month'), t('fin.gross'), t('fin.tax'), t('fin.company'), t('fin.net')],
        ...byMonth.map(([m, v]) => [m, v.gross.toFixed(2), v.tax.toFixed(2), (v.net + v.tax).toFixed(2), v.net.toFixed(2)]),
        ['—', totals.gross.toFixed(2), totals.tax.toFixed(2), totals.company.toFixed(2), totals.net.toFixed(2)],
      ])
    } else {
      download(kind === 'orders' ? 'zlecenia' : 'finanse', [
        ['№', t('ord.when'), t('ord.client'), t('crm.address'), t('ord.master'),
         t('fin.cash'), t('fin.card'), t('ord.materials'), t('fin.gross'),
         t('ord.masterEarns'), t('fin.company'), t('fin.tax'), t('fin.net')],
        ...rows.map((r) => [
          r.orders?.order_no, dateFull(r.created_at, lang), r.orders?.clients?.name ?? '',
          r.orders?.address ?? '', r.staff?.full_name ?? '',
          Number(r.cash_amount).toFixed(2), Number(r.card_amount).toFixed(2),
          Number(r.materials_cost).toFixed(2), Number(r.gross).toFixed(2),
          Number(r.master_share).toFixed(2), Number(r.company_share).toFixed(2),
          Number(r.tax_amount).toFixed(2), Number(r.company_net).toFixed(2),
        ]),
        ['', '', '', '', '', totals.cash.toFixed(2), totals.card.toFixed(2), totals.materials.toFixed(2),
         totals.gross.toFixed(2), totals.master.toFixed(2), totals.company.toFixed(2),
         totals.tax.toFixed(2), totals.net.toFixed(2)],
      ])
    }
  }

  const kinds: { key: Kind; label: string }[] = [
    { key: 'finance', label: t('rep.finance') },
    { key: 'masters', label: t('rep.masters') },
    { key: 'clients', label: t('rep.clients') },
    { key: 'tax', label: t('rep.tax') },
    { key: 'orders', label: t('rep.orders') },
  ]

  const monthPoints: Point[] = byMonth.map(([m, v]) => ({
    label: monthName(m, lang), value: v.gross,
    extra: `${t('fin.net')}: ${money(v.net, lang)} · ${nOrders(Number(v.orders), lang)}`,
  }))

  return (
    <>
      <div className="page__head noprint">
        <div>
          <h1 className="h1">{t('rep.title')}</h1>
          <p className="sub">{dateFull(range.from, lang)} — {dateFull(range.to, lang)} · {rows.length}</p>
        </div>
        <Range {...range} />
      </div>

      <div className="chips noprint">
        {kinds.map((k) => (
          <button key={k.key} className="chip" data-on={kind === k.key || undefined} onClick={() => setKind(k.key)}>
            {k.label}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={exportCsv} disabled={!rows.length}>CSV</button>
        <button className="btn btn--dark btn--sm" onClick={() => window.print()} disabled={!rows.length}>
          {t('rep.print')}
        </button>
      </div>

      {/* Шапка печатной версии: на бумаге нужно видеть, чей это отчёт и за что */}
      <div className="printhead">
        <b>HAWK.FIX — {kinds.find((k) => k.key === kind)?.label}</b>
        <span>{dateFull(range.from, lang)} — {dateFull(range.to, lang)}</span>
        <span>{t('rep.madeBy')}: {me.full_name} · {dateFull(new Date().toISOString(), lang)}</span>
      </div>

      {err && <p className="err noprint">{err}</p>}

      <div className="grid grid--4">
        <SumCard label={t('fin.gross')} value={money(totals.gross, lang)}
                 note={`${t('fin.cash')} ${money(totals.cash, lang)} · ${t('fin.card')} ${money(totals.card, lang)}`} />
        <SumCard label={t('fin.masters')} value={money(totals.master, lang)}
                 note={`${t('ord.materials')} ${money(totals.materials, lang)}`} />
        <SumCard label={t('fin.tax')} value={money(totals.tax, lang)} note={t('rep.taxNote')} />
        <SumCard label={t('fin.net')} value={money(totals.net, lang)}
                 note={`${t('dash.orders')}: ${totals.count}`} />
      </div>

      {byMonth.length > 1 && (
        <div className="card">
          <div className="card__head"><h2 className="h2">{t('fin.byMonth')}</h2></div>
          <BarChart data={monthPoints} format={(v) => money(v, lang)} height={200} />
        </div>
      )}

      <div className="card card--flush">
        <div className="tablewrap">
          {busy ? <p className="empty">{t('common.loading')}</p> : (
            <table className="tbl">
              {kind === 'masters' && (
                <>
                  <thead><tr>
                    <th>{t('ord.master')}</th><th className="right">{t('dash.orders')}</th>
                    <th className="right">{t('fin.gross')}</th><th className="right">{t('ord.masterEarns')}</th>
                    <th className="right">{t('ord.materials')}</th>
                  </tr></thead>
                  <tbody>
                    {byMaster.map((m) => (
                      <tr key={m.id} data-click onClick={() => { location.hash = `#/team/${m.id}` }}>
                        <td><b>{m.name}</b></td>
                        <td className="right num">{m.orders}</td>
                        <td className="right num">{money(m.gross, lang)}</td>
                        <td className="right num" style={{ color: 'var(--accent-text)' }}>{money2(m.share, lang)}</td>
                        <td className="right num">{money(m.materials, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {kind === 'clients' && (
                <>
                  <thead><tr>
                    <th>{t('ord.client')}</th><th>{t('crm.phone')}</th>
                    <th className="right">{t('crm.orders')}</th><th className="right">{t('crm.spent')}</th><th></th>
                  </tr></thead>
                  <tbody>
                    {byClient.map((c) => (
                      <tr key={c.id} data-click onClick={() => { location.hash = `#/clients/${c.id}` }}>
                        <td><b>{c.name}</b></td>
                        <td className="num">{c.phone}</td>
                        <td className="right num">{c.orders}</td>
                        <td className="right num">{money(c.gross, lang)}</td>
                        <td className="right"><span className="badge badge--ghost">{t(`crm.${c.status}`)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {kind === 'tax' && (
                <>
                  <thead><tr>
                    <th>{t('common.month')}</th><th className="right">{t('fin.gross')}</th>
                    <th className="right">{t('fin.tax')}</th><th className="right">{t('fin.company')}</th>
                    <th className="right">{t('fin.net')}</th>
                  </tr></thead>
                  <tbody>
                    {byMonth.map(([m, v]) => (
                      <tr key={m}>
                        <td><b>{monthName(m, lang)}</b></td>
                        <td className="right num">{money2(v.gross, lang)}</td>
                        <td className="right num">{money2(v.tax, lang)}</td>
                        <td className="right num">{money2(v.net + v.tax, lang)}</td>
                        <td className="right num"><b>{money2(v.net, lang)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {(kind === 'finance' || kind === 'orders') && (
                <>
                  <thead><tr>
                    <th>№</th><th>{t('ord.when')}</th><th>{t('ord.client')}</th><th>{t('ord.master')}</th>
                    {kind === 'orders' && <th>{t('crm.address')}</th>}
                    <th className="right">{t('fin.gross')}</th>
                    {kind === 'finance' && <th className="right">{t('ord.masterEarns')}</th>}
                    {kind === 'finance' && <th className="right">{t('fin.tax')}</th>}
                    {kind === 'finance' && <th className="right">{t('fin.net')}</th>}
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} data-click onClick={() => { location.hash = `#/orders/${r.order_id}` }}>
                        <td className="num"><b>{r.orders?.order_no}</b></td>
                        <td className="num muted">{dateShort(r.created_at, lang)}</td>
                        <td>{r.orders?.clients?.name ?? '—'}</td>
                        <td>{r.staff?.full_name ?? '—'}</td>
                        {kind === 'orders' && <td className="muted">{r.orders?.address ?? '—'}</td>}
                        <td className="right num">{money2(r.gross, lang)}</td>
                        {kind === 'finance' && <td className="right num" style={{ color: 'var(--accent-text)' }}>{money2(r.master_share, lang)}</td>}
                        {kind === 'finance' && <td className="right num">{money2(r.tax_amount, lang)}</td>}
                        {kind === 'finance' && <td className="right num"><b>{money2(r.company_net, lang)}</b></td>}
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={9}><p className="empty">{t('common.empty')}</p></td></tr>}
                  </tbody>
                </>
              )}
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function SumCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value num">{value}</div>
      {note && <div className="stat__foot">{note}</div>}
    </div>
  )
}
