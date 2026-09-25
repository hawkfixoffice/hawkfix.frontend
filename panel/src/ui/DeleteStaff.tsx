import { useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Modal from './Modal'

/** Окно «удалить сотрудника».
 *
 *  Что именно произойдёт, решает база (delete_staff): если за человеком
 *  нет ни одного заказа и отчёта — учётка удаляется целиком; если история
 *  есть — вход закрывается навсегда, человек пропадает из команды, а его
 *  имя остаётся в старых заказах и финансах. Незакрытые заказы в обоих
 *  случаях снимаются с него и уходят автоподбору.
 *
 *  Подтверждаем вводом ника: удаление необратимо, одного клика мало. */
export default function DeleteStaff({ staff, onClose, onDone }: {
  staff: { id: string; username: string; full_name: string }
  onClose: () => void
  onDone: (res: { mode: string; orders_moved: number }) => void
}) {
  const { t } = useT()
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ready = typed.trim().toLowerCase() === staff.username.toLowerCase()

  async function go() {
    setBusy(true); setMsg('')
    const { data, error } = await sb.rpc('delete_staff', { p_staff: staff.id, p_reason: reason || null })
    if (error) { setBusy(false); setMsg(error.message); return }
    // Файл фотографии Storage удалить из SQL не даёт — убираем здесь,
    // если учётка ушла целиком (при архиве фото остаётся в истории)
    if (data?.mode === 'deleted' && data?.avatar) {
      await sb.storage.from('avatars').remove([data.avatar]).catch(() => {})
    }
    setBusy(false)
    onDone(data)
  }

  return (
    <Modal title={`${t('staffDel.title')} · ${staff.full_name}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t('staffDel.what')}</p>
      <ul className="tiny muted" style={{ paddingInlineStart: 18, margin: '0 0 12px' }}>
        <li>{t('staffDel.p1')}</li>
        <li>{t('staffDel.p2')}</li>
        <li>{t('staffDel.p3')}</li>
      </ul>

      <div className="field">
        <label>{t('del.reason')}</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('staffDel.reasonHint')} />
      </div>
      <div className="field">
        <label>{t('staffDel.confirm', { u: staff.username })}</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={staff.username} autoComplete="off" />
      </div>

      {msg && <p className="err">{msg}</p>}
      <div className="split">
        <button className="btn btn--danger" disabled={busy || !ready} onClick={go}>
          {busy ? <span className="spin" /> : t('staffDel.go')}
        </button>
        <button className="btn btn--ghost" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </Modal>
  )
}
