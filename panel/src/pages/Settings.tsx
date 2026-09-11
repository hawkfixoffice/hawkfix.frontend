import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'

/** Ставки, от которых считаются деньги. Меняются без правок кода,
 *  но задним числом ничего не пересчитывают: в закрытом отчёте
 *  сохранены те проценты, что действовали в день работы. */
export default function Settings() {
  const { t } = useT()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    sb.from('panel_settings').select('key, value').then(({ data }) => {
      const v: Record<string, string> = {}
      ;(data ?? []).forEach((r: any) => { v[r.key] = String(r.value).replace(/^"|"$/g, '') })
      setVals(v)
    })
  }, [])

  async function save(key: string, raw: string) {
    const value = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
    await sb.from('panel_settings').update({ value }).eq('key', key)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const rows: { key: string; label: string; hint?: string }[] = [
    { key: 'master_pct', label: t('set.masterPct'), hint: '80' },
    { key: 'tax_pct', label: t('set.taxPct'), hint: '0' },
    { key: 'offer_ttl_min', label: t('set.offerTtl'), hint: '20' },
    { key: 'offer_ttl_night_min', label: t('set.offerTtlNight'), hint: '120' },
    { key: 'day_from', label: t('set.dayFrom'), hint: '08:00' },
    { key: 'day_to', label: t('set.dayTo'), hint: '20:00' },
    { key: 'quiet_from', label: t('set.quietFrom'), hint: '23:00' },
    { key: 'quiet_to', label: t('set.quietTo'), hint: '05:00' },
    { key: 'client_regular_orders', label: t('set.regular'), hint: '3' },
    { key: 'client_vip_orders', label: t('set.vipOrders'), hint: '5' },
    { key: 'client_vip_spent', label: t('set.vipSpent'), hint: '5000' },
    { key: 'client_lost_days', label: t('set.lostDays'), hint: '180' },

  ]

  return (
    <>
      <div className="page__head">
        <div><h1 className="h1">{t('set.title')}</h1></div>
        {saved && <span className="badge badge--mint">{t('common.save')} ✓</span>}
      </div>

      <div className="card grid grid--2">
        {rows.map((r) => (
          <div className="field" key={r.key}>
            <label>{r.label}</label>
            <input value={vals[r.key] ?? ''} placeholder={r.hint}
                   onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })}
                   onBlur={(e) => save(r.key, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="h2">{t('set.clients')}</h2>
        <p className="muted tiny" style={{ margin: '6px 0 0' }}>
          {t('set.taxHint')}
        </p>
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }}
                onClick={() => sb.rpc('recalc_all_clients').then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500) })}>
          {t('set.recalc')}
        </button>
      </div>
    </>
  )
}
