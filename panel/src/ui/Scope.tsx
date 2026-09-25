import { useEffect, useState } from 'react'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money } from '../lib/fmt'
import Modal from './Modal'

/**
 * Работы «за объём»: цену такой работы клиент не видит на сайте —
 * он прикладывает фото, а мастер называет цену, глядя на снимки, либо
 * отмечает «оценю на месте» и называет её, когда приехал. До цены
 * работу начать нельзя: это проверяет база (set_order_status).
 */

type Line = { key?: string; name: string; qty: number; sum: number; ptype?: string }

/** Какие строки сметы — «за объём». Новые заявки несут тип в самой строке,
 *  у старых спрашиваем прайс. */
export function useScopeLines(items: Line[]): Line[] {
  const [types, setTypes] = useState<Record<string, string>>({})
  const keys = items.filter((i) => i.key && !i.ptype).map((i) => i.key as string)
  useEffect(() => {
    if (!keys.length) return
    sb.from('price_items').select('key, ptype').in('key', keys)
      .then(({ data }) => setTypes(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.ptype]))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(',')])
  return items.filter((i) => (i.ptype ?? (i.key ? types[i.key] : undefined)) === 'scope')
}

/** Фото клиента из приватного бакета: ссылки подписываются на час. */
export function ClientPhotos({ paths }: { paths: string[] }) {
  const { t } = useT()
  const [urls, setUrls] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!paths?.length) { setUrls([]); return }
    sb.storage.from('lead-photos').createSignedUrls(paths, 3600)
      .then(({ data }) => setUrls((data ?? []).map((x) => x.signedUrl).filter(Boolean) as string[]))
  }, [paths?.join(',')])

  if (!paths?.length) return <p className="muted tiny">{t('scope.noPhotos')}</p>
  return (
    <>
      <div className="photos">
        {urls.map((u, n) => (
          <button type="button" className="photos__item" key={u} onClick={() => setOpen(u)}
                  aria-label={`${t('scope.photo')} ${n + 1}`}>
            <img src={u} alt="" loading="lazy" />
          </button>
        ))}
        {urls.length < paths.length && Array.from({ length: paths.length - urls.length }).map((_, n) => (
          <span className="photos__item photos__item--wait" key={n}><span className="spin" /></span>
        ))}
      </div>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={open} alt="" />
          <button type="button" className="btn btn--ghost btn--sm lightbox__x" onClick={() => setOpen(null)}>✕</button>
        </div>
      )}
    </>
  )
}

/** Блок в карточке заказа: фото, что оценить и цена мастера. */
export function ScopeCard({ order, me, onDone }: { order: any; me: Me; onDone: () => void }) {
  const { t, lang } = useT()
  const lines = useScopeLines(order.items ?? [])
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hasPhotos = (order.photos ?? []).length > 0
  if (!order.quote_state && !hasPhotos) return null

  const canQuote = order.quote_state && !['done', 'cancelled'].includes(order.status)
    && (order.master_id === me.id || me.role !== 'master')

  async function save(onsite: boolean) {
    const p = Number(price.replace(',', '.'))
    if (!onsite && !(p >= 0 && price.trim())) { setErr(t('scope.needPrice')); return }
    setBusy(true); setErr('')
    const { error } = await sb.rpc('set_scope_quote', {
      o_id: order.id, p_price: onsite ? null : p, p_onsite: onsite,
    })
    setBusy(false)
    if (error) setErr(error.message); else { setPrice(''); onDone() }
  }

  return (
    <div className="card scope">
      <div className="card__head">
        <div>
          <h2 className="h2">{t('scope.title')}</h2>
          <p className="card__note">{t('scope.note')}</p>
        </div>
        {order.quote_state && <span className={`badge ${order.quote_state === 'quoted' ? 'badge--mint' : 'badge--warn'}`}>
          {t(`scope.state.${order.quote_state}`)}
        </span>}
      </div>

      {lines.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {lines.map((l, n) => <span className="chip" key={n}>{l.name} ×{l.qty}</span>)}
        </div>
      )}

      <ClientPhotos paths={order.photos ?? []} />

      {order.quote_state === 'quoted' && (
        <p className="scope__price">
          {t('scope.masterPrice')}: <b className="num">{money(order.scope_price, lang)}</b>
          {order.scope_est ? <small className="muted"> · {t('scope.clientSaw')} {money(order.scope_est, lang)}</small> : null}
        </p>
      )}

      {canQuote && (
        <>
          <hr className="hr" />
          <div className="split scope__form">
            <div className="field" style={{ minWidth: 160, flex: 1 }}>
              <label>{order.quote_state === 'quoted' ? t('scope.change') : t('scope.priceLabel')}</label>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
                     placeholder={order.scope_est ? String(Math.round(order.scope_est)) : '0'} />
            </div>
            <button className="btn btn--primary" disabled={busy} onClick={() => save(false)}>
              {busy ? <span className="spin" /> : t('scope.save')}
            </button>
            {order.quote_state === 'pending' && (
              <button className="btn btn--ghost" disabled={busy} onClick={() => save(true)}>{t('scope.onsite')}</button>
            )}
          </div>
          {order.quote_state === 'onsite' && <p className="tiny muted">{t('scope.onsiteHint')}</p>}
          {err && <p className="err">{err}</p>}
        </>
      )}
    </div>
  )
}

/** Окно «беру заказ» для заказа с работами «за объём»: мастер видит фото
 *  и либо называет цену, либо отмечает, что оценит на месте. */
export function AcceptQuote({ offerId, order, onClose, onDone }: {
  offerId: string; order: any; onClose: () => void; onDone: () => void
}) {
  const { t, lang } = useT()
  const lines = useScopeLines(order.items ?? [])
  const [price, setPrice] = useState('')
  const [onsite, setOnsite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    const p = Number(price.replace(',', '.'))
    if (!onsite && !(price.trim() && p >= 0)) { setErr(t('scope.needChoice')); return }
    setBusy(true); setErr('')
    const { error } = await sb.rpc('accept_offer', {
      f_id: offerId, p_price: onsite ? null : p, p_onsite: onsite,
    })
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <Modal title={`${t('ord.accept')} · ${order.order_no}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t('scope.acceptLead')}</p>
      {lines.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {lines.map((l, n) => <span className="chip" key={n}>{l.name} ×{l.qty}</span>)}
        </div>
      )}
      <ClientPhotos paths={order.photos ?? []} />
      {order.comment && <p className="scope__comment">«{order.comment}»</p>}
      {order.scope_est > 0 && <p className="tiny muted">{t('scope.clientSaw')} {money(order.scope_est, lang)}</p>}

      <div className="field" style={{ marginTop: 12 }}>
        <label>{t('scope.priceLabel')}</label>
        <input inputMode="decimal" value={price} disabled={onsite} autoFocus
               onChange={(e) => setPrice(e.target.value)} placeholder="0" />
      </div>
      <label className="check">
        <input type="checkbox" checked={onsite} onChange={(e) => setOnsite(e.target.checked)} />
        <span>{t('scope.onsiteLong')}</span>
      </label>

      {err && <p className="err">{err}</p>}
      <div className="split" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" disabled={busy} onClick={go}>
          {busy ? <span className="spin" /> : t('ord.accept')}
        </button>
        <button className="btn btn--ghost" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </Modal>
  )
}
