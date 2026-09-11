import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Modal from './Modal'
import Avatar from './Avatar'

interface Cand {
  master_id: string
  full_name: string
  score: number
  skills_ok: boolean
  load: number
  capacity: number
  distance_km: number | null
}

/** Окно «назначить мастера».
 *
 *  Показывает тот же список, по которому выбирает автоподбор: умения,
 *  свободные руки, расстояние до адреса. Человек видит, почему первый в
 *  списке первый, и может выбрать другого — например, зная то, чего база
 *  не знает. Рядом кнопка «предложить заново»: вернуть заказ автоподбору,
 *  а не назначать своей рукой. */
export default function Assign({ orderId, orderNo, onClose, onDone }: {
  orderId: string
  orderNo: string
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useT()
  const [list, setList] = useState<Cand[] | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    sb.rpc('rank_masters', { o_id: orderId })
      .then(({ data, error }) => { setList((data ?? []) as Cand[]); if (error) setMsg(error.message) })
  }, [orderId])

  async function assign(m: Cand) {
    setBusy(m.master_id); setMsg('')
    const { error } = await sb.rpc('assign_master', { o_id: orderId, m_id: m.master_id })
    setBusy('')
    if (error) { setMsg(error.message); return }
    onDone(); onClose()
  }

  async function again() {
    setBusy('again'); setMsg('')
    const { data, error } = await sb.rpc('redispatch_order', { o_id: orderId })
    setBusy('')
    if (error) { setMsg(error.message); return }
    if (data?.quiet) { setMsg(t('att.stillQuiet')); return }
    if (!data?.ok) { setMsg(t('att.noFreeMaster')); return }
    onDone(); onClose()
  }

  return (
    <Modal title={`${t('att.assign')} · ${orderNo}`} onClose={onClose}>
      {list === null && <p className="empty">{t('common.loading')}</p>}

      {list?.length === 0 && <p className="empty">{t('att.noFreeMaster')}</p>}

      {list && list.length > 0 && (
        <div className="picklist">
          {list.map((m) => (
            <div className="picklist__row" key={m.master_id}>
              <Avatar name={m.full_name} />
              <div className="picklist__who">
                <b>{m.full_name}</b>
                <small className="muted">
                  {m.skills_ok ? t('att.skillsOk') : t('att.skillsPart')} ·{' '}
                  {t('att.load')} {m.load}/{m.capacity}
                  {m.distance_km != null ? ` · ${m.distance_km} km` : ''}
                </small>
              </div>
              <button className="btn btn--primary btn--sm" disabled={busy !== ''}
                      onClick={() => assign(m)}>
                {busy === m.master_id ? '…' : t('att.assign')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="split" style={{ marginTop: 6 }}>
        <button className="btn btn--ghost btn--sm" disabled={busy !== ''} onClick={again}>
          {busy === 'again' ? '…' : t('att.again')}
        </button>
        {msg && <span className="muted tiny">{msg}</span>}
      </div>
    </Modal>
  )
}
