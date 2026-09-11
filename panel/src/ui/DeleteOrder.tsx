import { useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Modal from './Modal'

/** Окно «удалить заказ».
 *
 *  Удаление необратимо для интерфейса, поэтому окно честно перечисляет,
 *  что уйдёт вместе с заказом (лента, предложения, отчёт, чеки), и просит
 *  причину — она ложится в корзину базы рядом со снимком заказа.
 *
 *  У закрытого заказа спрашиваем номер: его сумма уже посчитана в финансах
 *  и в статусе клиента, и такое удаление меняет отчётность. Один
 *  подтверждающий клик для этого слишком дешёв. */
export default function DeleteOrder({ order, onClose, onDone }: {
  order: { id: string; order_no: string; status: string }
  onClose: () => void
  onDone: (orderNo: string) => void
}) {
  const { t } = useT()
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const hard = order.status === 'done'
  const ready = !hard || typed.trim().toUpperCase() === order.order_no.toUpperCase()

  async function go() {
    setBusy(true); setMsg('')
    const { data, error } = await sb.rpc('delete_order', { o_id: order.id, p_reason: reason || null })
    if (error) { setBusy(false); setMsg(error.message); return }

    // Чеки живут в Storage, а не в базе: Postgres удалять их не даёт
    // («Direct deletion from storage tables is not allowed»), поэтому
    // файлы убираем здесь, по путям из ответа функции. Не вышло — заказ
    // всё равно удалён, а имена файлов лежат в снимке корзины.
    const files: string[] = data?.receipts ?? []
    if (files.length) await sb.storage.from('receipts').remove(files).catch(() => {})

    setBusy(false)
    onDone(order.order_no)
  }

  return (
    <Modal title={`${t('del.title')} · ${order.order_no}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t('del.what')}</p>
      {hard && <p className="err">{t('del.doneWarn')}</p>}

      <div className="field">
        <label>{t('del.reason')}</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder={t('del.reasonHint')} />
      </div>

      {hard && (
        <div className="field">
          <label>{t('del.confirm', { no: order.order_no })}</label>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={order.order_no} />
        </div>
      )}

      <p className="tiny muted">{t('del.trash')}</p>
      {msg && <p className="err">{msg}</p>}

      <div className="split">
        <button className="btn btn--danger" disabled={busy || !ready} onClick={go}>
          {busy ? <span className="spin" /> : t('del.go')}
        </button>
        <button className="btn btn--ghost" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </Modal>
  )
}
