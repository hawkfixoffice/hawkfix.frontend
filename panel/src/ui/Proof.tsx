import { useEffect, useRef, useState } from 'react'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rid, toWebp } from '../../../src/lib/webp'

/**
 * Фото «до» и «после» — подтверждение работы.
 *
 * Перед началом мастер снимает место как есть, после окончания — готовую
 * работу. Без фото «до» работа не начинается, без фото «после» заказ не
 * закрывается: спор с клиентом о том, «так и было» или «так стало»,
 * решается снимком, а не словами.
 *
 * Файлы лежат в приватном бакете order-photos в папке заказа, в самом
 * заказе — только пути (proof_before / proof_after).
 */

type Kind = 'before' | 'after'

/** Нужны ли ещё фото этого вида: админ правилом не связан. */
export const proofMissing = (order: any, kind: Kind, me: Me) =>
  me.role !== 'admin' && (order?.[`proof_${kind}`] ?? []).length === 0

export default function ProofCard({ order, me, onDone }: { order: any; me: Me; onDone: () => void }) {
  const { t } = useT()
  const before: string[] = order.proof_before ?? []
  const after: string[] = order.proof_after ?? []

  const mine = order.master_id === me.id
  const office = me.role !== 'master'
  const live = !['new', 'offered', 'cancelled'].includes(order.status)
  // Пока заказ никому не назначен, снимать нечего и некому
  if (!live && before.length + after.length === 0) return null

  const canAdd = (mine || office) && live
  // Мастер после закрытия заказа фото не трогает: они уже часть отчёта
  const canRemove = office || (mine && order.status !== 'done')
  const afterOpen = ['in_progress', 'done'].includes(order.status)

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2 className="h2">{t('proof.title')}</h2>
          <p className="card__note">{t('proof.note')}</p>
        </div>
      </div>

      <div className="grid grid--2 proof">
        <ProofSide orderId={order.id} kind="before" paths={before}
                   canAdd={canAdd && order.status !== 'done'} canRemove={canRemove} onDone={onDone}
                   hint={before.length === 0 && live && order.status !== 'done' ? t('proof.needBefore') : ''} />
        <ProofSide orderId={order.id} kind="after" paths={after}
                   canAdd={canAdd && afterOpen} canRemove={canRemove} onDone={onDone}
                   hint={!afterOpen ? t('proof.afterLater')
                     : after.length === 0 && order.status === 'in_progress' ? t('proof.needAfter') : ''} />
      </div>
    </div>
  )
}

function ProofSide({ orderId, kind, paths, canAdd, canRemove, hint, onDone }: {
  orderId: string; kind: Kind; paths: string[]; canAdd: boolean; canRemove: boolean
  hint: string; onDone: () => void
}) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!paths.length) { setUrls({}); return }
    let alive = true
    sb.storage.from('order-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!alive) return
      setUrls(Object.fromEntries((data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string])))
    })
    return () => { alive = false }
  }, [paths.join(',')])

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setErr(''); setBusy(list.length)
    const done: string[] = []
    try {
      for (const f of list) {
        // Любой снимок → WebP (правило проекта), длинная сторона 2000 px
        const body = await toWebp(f, 2000, 0.82)
        const path = `${orderId}/${kind}-${Date.now()}-${rid()}.webp`
        const up = await sb.storage.from('order-photos').upload(path, body, { upsert: false, contentType: 'image/webp' })
        if (up.error) throw up.error
        done.push(path)
        setBusy((n) => n - 1)
      }
    } catch (e) {
      setErr(`${t('proof.fail')} ${(e as Error).message}`)
    }
    // Что успело загрузиться — записываем в заказ, даже если один файл упал
    if (done.length) {
      const { error } = await sb.rpc('add_proof', { o_id: orderId, p_kind: kind, p_paths: done })
      if (error) setErr(error.message)
    }
    setBusy(0)
    if (input.current) input.current.value = ''
    onDone()
  }

  async function remove(path: string) {
    setErr('')
    const { error } = await sb.rpc('remove_proof', { o_id: orderId, p_path: path })
    if (error) { setErr(error.message); return }
    await sb.storage.from('order-photos').remove([path]).catch(() => {})
    onDone()
  }

  return (
    <div className="proof__side">
      <div className="split" style={{ marginBottom: 8 }}>
        <b>{t(`proof.${kind}`)}</b>
        <span className={`badge ${paths.length ? 'badge--mint' : 'badge--ghost'}`}>{paths.length}</span>
      </div>

      <div className="photos">
        {paths.map((p, n) => (
          <span className="photos__item proof__item" key={p}>
            {urls[p]
              ? <button type="button" className="proof__open" onClick={() => setOpen(urls[p])}
                        aria-label={`${t(`proof.${kind}`)} ${n + 1}`}><img src={urls[p]} alt="" loading="lazy" /></button>
              : <span className="spin" />}
            {canRemove && (
              <button type="button" className="proof__x" aria-label={t('proof.remove')} onClick={() => remove(p)}>✕</button>
            )}
          </span>
        ))}
        {Array.from({ length: busy }).map((_, n) => (
          <span className="photos__item photos__item--wait" key={`w${n}`}><span className="spin" /></span>
        ))}
        {canAdd && (
          <button type="button" className="photos__item proof__add" disabled={busy > 0}
                  onClick={() => input.current?.click()}>
            <span aria-hidden="true">＋</span>
            <small>{t('proof.add')}</small>
          </button>
        )}
      </div>
      {/* Без capture: телефон сам предложит камеру или галерею */}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />

      {paths.length === 0 && !canAdd && <p className="muted tiny" style={{ margin: '8px 0 0' }}>{t('proof.none')}</p>}
      {hint && <p className="tiny muted" style={{ margin: '8px 0 0' }}>{hint}</p>}
      {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}

      {open && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={open} alt="" />
          <button type="button" className="btn btn--ghost btn--sm lightbox__x" onClick={() => setOpen(null)}>✕</button>
        </div>
      )}
    </div>
  )
}
