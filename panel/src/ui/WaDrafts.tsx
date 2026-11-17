import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, fromNow } from '../lib/fmt'
import Modal from './Modal'

interface Draft {
  id: string
  wa_code: string | null
  created_at: string
  locale: string
  items: { name?: string; qty?: number }[]
  totals: { total?: number; approx?: boolean }
  comment: string | null
  urgent: boolean
}

/** Черновики «Wyślij na WhatsApp» с сайта.
 *
 *  Клиент собрал смету и нажал WhatsApp: в чат пришло «Zamówienie HF-7K3F9»
 *  со сметой, а здесь лежит тот же черновик. Офис находит его по коду,
 *  вписывает телефон из чата — и черновик становится обычным заказом
 *  с подбором мастера. Черновики старше 7 дней не показываются. */
export default function WaDrafts() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [rows, setRows] = useState<Draft[]>([])
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Draft | null>(null)

  const load = () => { sb.rpc('wa_drafts').then(({ data }) => setRows((data ?? []) as Draft[])) }
  useEffect(load, [])
  useEffect(() => {
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  if (rows.length === 0) return null

  const needle = q.trim().toUpperCase().replace(/^HF-?/, '')
  const shown = needle ? rows.filter((r) => (r.wa_code ?? '').toUpperCase().includes(needle)) : rows

  async function drop(r: Draft) {
    if (!window.confirm(t('wa.dropAsk', { code: r.wa_code ?? '' }))) return
    await sb.rpc('wa_draft_drop', { l_id: r.id })
    load()
  }

  return (
    <div className="card card--flush">
      <div className="card__head" style={{ padding: '20px 22px 0', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="h2">{t('wa.title')}</h2>
          <p className="card__note">{t('wa.note')}</p>
        </div>
        <div className="field" style={{ minWidth: 160 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="HF-7K3F9"
                 aria-label={t('wa.find')} autoCapitalize="characters" />
        </div>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="num">
                  <b>{r.wa_code ?? '—'}</b>
                  {r.urgent && <span className="badge badge--warn" style={{ marginInlineStart: 6 }}>!</span>}
                  <small className="muted" style={{ display: 'block' }}>{fromNow(r.created_at, lang)} · {r.locale.toUpperCase()}</small>
                </td>
                <td>
                  {r.items.length
                    ? r.items.map((i) => `${i.name} ×${i.qty}`).join(', ')
                    : <span className="muted">{t('wa.noItems')}</span>}
                  {r.comment && <small className="muted" style={{ display: 'block' }}>{r.comment.slice(0, 140)}</small>}
                </td>
                <td className="right num">{r.totals?.total ? `${r.totals.approx ? '≥ ' : ''}${money(r.totals.total, lang)}` : '—'}</td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn--dark btn--sm" onClick={() => setPick(r)}>{t('wa.accept')}</button>{' '}
                  <button className="btn btn--ghost btn--sm" onClick={() => drop(r)} aria-label={t('wa.drop')}>✕</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td className="muted" colSpan={4}>{t('wa.notFound')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pick && (
        <Accept draft={pick} onClose={() => setPick(null)}
                onDone={(orderId) => { setPick(null); load(); nav(`/orders/${orderId}`) }} />
      )}
    </div>
  )
}

function Accept({ draft, onClose, onDone }: { draft: Draft; onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useT()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (phone.replace(/\D/g, '').length < 9) { setErr(t('wa.phoneBad')); return }
    setBusy(true); setErr('')
    const { data, error } = await sb.rpc('wa_draft_accept', {
      l_id: draft.id, p_name: name, p_phone: phone, p_address: address || null,
    })
    setBusy(false)
    if (error) { setErr(error.message.includes('draft_not_found') ? t('wa.gone') : error.message); return }
    onDone(String(data))
  }

  return (
    <Modal title={`${t('wa.accept')} · ${draft.wa_code ?? ''}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <p className="card__note" style={{ margin: 0 }}>{t('wa.acceptNote')}</p>
        <div className="field">
          <label htmlFor="wa-phone">{t('wa.phone')} *</label>
          <input id="wa-phone" type="tel" inputMode="tel" autoComplete="off" value={phone}
                 onChange={(e) => setPhone(e.target.value)} placeholder="+48 …" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="wa-name">{t('wa.name')}</label>
          <input id="wa-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="wa-addr">{t('wa.address')}</label>
          <input id="wa-addr" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        {err && <p role="alert" style={{ color: 'var(--bad)', margin: 0 }}>{err}</p>}
        <div className="split" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{t('wa.toOrder')}</button>
        </div>
      </form>
    </Modal>
  )
}
