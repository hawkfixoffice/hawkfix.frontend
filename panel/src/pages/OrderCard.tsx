import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money, money2, dateTime, dateFull, fromNow, initials } from '../lib/fmt'
import { currentPosition } from '../lib/geo'
import { createMap, marker, drawRoute, fetchRoute, geocode, shopsNear, navLink,
         FOREST, ACCENT, type Shop, type Pt, type RouteResult } from '../lib/maps'
import Status from '../ui/Status'
import Avatar from '../ui/Avatar'
import Assign from '../ui/Assign'

/** Карточка заказа: путь мастера, магазин по дороге, отчёт и деньги.
 *  Мастер видит только свои 80 %, доля фирмы — для админа. */
export default function OrderCard({ me }: { me: Me }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { t, lang } = useT()
  const [o, setO] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [report, setReport] = useState<any>(null)
  const [offer, setOffer] = useState<any>(null)
  /** Вся история предложений: кому уходил заказ и чем это кончилось */
  const [offers, setOffers] = useState<any[]>([])
  const [assign, setAssign] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await sb.from('orders')
      .select('*, clients(*), staff!orders_master_id_fkey(id, full_name, phone), order_reports(*)')
      .eq('id', id).maybeSingle()
    setO(data)
    // Офис читает отчёт целиком, мастер — представление без долей фирмы
    if (me.role === 'master') {
      const { data: mine } = await sb.from('my_reports').select('*').eq('order_id', id).maybeSingle()
      setReport(mine ?? null)
    } else {
      setReport((data as any)?.order_reports?.[0] ?? null)
    }
    sb.from('order_events').select('*, staff(full_name)').eq('order_id', id)
      .order('at', { ascending: false }).then(({ data }) => setEvents(data ?? []))
    sb.from('order_offers').select('*, staff(full_name, avatar_path)').eq('order_id', id)
      .order('offered_at', { ascending: false })
      .then(({ data }) => {
        const all = data ?? []
        setOffers(all)
        setOffer(all.find((f: any) => f.status === 'pending') ?? null)
      })
  }
  useEffect(() => { load() }, [id])

  // Новый заказ ночью никому не рассылается — это правило, а не поломка,
  // и человек должен видеть его в карточке, а не гадать
  const [quiet, setQuiet] = useState<{ on: boolean; to: string } | null>(null)
  useEffect(() => {
    Promise.all([
      sb.rpc('is_quiet_now'),
      sb.from('panel_settings').select('value').eq('key', 'quiet_to').maybeSingle(),
    ]).then(([q, s]) => setQuiet({
      on: Boolean(q.data),
      to: String(s.data?.value ?? '05:00').replace(/"/g, ''),
    }))
  }, [])

  if (!o) return <p className="empty">{t('common.loading')}</p>

  const late = o.deadline_at && new Date(o.deadline_at) < new Date() && !['done', 'cancelled'].includes(o.status)
  const isMine = o.master_id === me.id
  const canDrive = isMine || me.role === 'admin'
  const items: { name: string; qty: number; sum: number }[] = o.items ?? []

  async function step(status: string) {
    const { error } = await sb.rpc('set_order_status', { o_id: id, new_status: status })
    setMsg(error ? error.message : '')
    load()
  }

  async function answerOffer(yes: boolean) {
    const { error } = yes
      ? await sb.rpc('accept_offer', { f_id: offer.id })
      : await sb.rpc('decline_offer', { f_id: offer.id, why: null })
    setMsg(error ? error.message : '')
    load()
  }

  return (
    <>
      <div className="page__head">
        <div>
          <div className="split">
            <Link className="btn btn--ghost btn--sm" to="/orders">← {t('ord.title')}</Link>
            <Status value={o.status} overdue={!!late} />
            {o.status === 'new' && quiet?.on && (
              <span className="badge badge--warn">{t('ord.frozen', { to: quiet.to })}</span>
            )}
            {o.urgent && <span className="badge badge--warn">{t('ord.status.offered') && '!'} +50%</span>}
          </div>
          <h1 className="h1" style={{ marginTop: 10 }}>{o.order_no}</h1>
          <p className="sub">
            {dateFull(o.scheduled_date, lang)} {o.scheduled_slot ?? ''} ·{' '}
            {late ? <span style={{ color: 'var(--bad)' }}>{t('ord.overdue')} {fromNow(o.deadline_at, lang)}</span>
                  : <span>{t('ord.when')} {fromNow(o.deadline_at, lang)}</span>}
          </p>
        </div>

        <div className="split">
          {me.role !== 'master' && (o.status === 'new' || o.status === 'offered') && (
            <button className="btn btn--dark" onClick={() => setAssign(true)}>{t('att.assign')}</button>
          )}
          {offer && isMine && (
            <>
              <span className="badge badge--warn">{fromNow(offer.expires_at, lang)}</span>
              <button className="btn btn--primary" onClick={() => answerOffer(true)}>{t('ord.accept')}</button>
              <button className="btn btn--ghost" onClick={() => answerOffer(false)}>{t('ord.decline')}</button>
            </>
          )}
          {canDrive && o.status === 'assigned' && <button className="btn btn--dark" onClick={() => step('en_route')}>{t('ord.go')}</button>}
          {canDrive && o.status === 'en_route' && (
            <>
              <button className="btn btn--ghost" onClick={() => step('shopping')}>{t('ord.buy')}</button>
              <button className="btn btn--dark" onClick={() => step('in_progress')}>{t('ord.start')}</button>
            </>
          )}
          {canDrive && o.status === 'shopping' && <button className="btn btn--dark" onClick={() => step('in_progress')}>{t('ord.start')}</button>}
        </div>
      </div>

      {msg && <p className="err">{msg}</p>}

      {assign && (
        <Assign orderId={o.id} orderNo={o.order_no}
                onClose={() => setAssign(false)} onDone={load} />
      )}

      <div className="grid grid--wide-left">
        <div className="grid">
          {/* -------- маршрут -------- */}
          <RouteCard order={o} me={me} />

          {/* -------- отчёт -------- */}
          {o.status === 'in_progress' && canDrive && !report && (
            <ReportForm orderId={o.id} onDone={() => { load(); nav(0) }} />
          )}
          {report && <ReportView report={report} me={me} />}
        </div>

        <div className="grid">
          {/* -------- подбор мастера: кому предложен и кто отказался -------- */}
          {me.role !== 'master' && offers.length > 0 && (
            <div className="card">
              <div className="card__head">
                <div><h2 className="h2">{t('att.title')}</h2>
                  <p className="card__note">
                    {offer ? t('att.offered') : o.status === 'new' ? t(`att.${quiet?.on ? 'quiet' : 'refused'}`) : ''}
                  </p></div>
              </div>
              <div className="list">
                {offers.map((f: any) => (
                  <div className="list__row" key={f.id}>
                    <Avatar name={f.staff?.full_name ?? '?'} path={f.staff?.avatar_path} size="sm" />
                    <span style={{ minWidth: 0 }}>
                      <b>{f.staff?.full_name ?? '—'}</b>
                      <small>{t(`ord.offer.${f.status}`)}</small>
                    </span>
                    <span className="list__right muted tiny">
                      {fromNow(f.status === 'pending' ? f.expires_at : (f.answered_at ?? f.offered_at), lang)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------- клиент -------- */}
          <div className="card">
            <div className="card__head"><h2 className="h2">{t('ord.client')}</h2>
              {me.role !== 'master' && o.clients &&
                <Link className="btn btn--ghost btn--sm" to={`/clients/${o.clients.id}`}>{t('common.open')}</Link>}</div>
            <div className="list">
              <div className="list__row">
                <span className="avatar avatar--sm">{initials(o.clients?.name ?? '?')}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{o.clients?.name}</b>
                  <small>{o.district ?? ''}</small>
                </span>
              </div>
              <div className="list__row"><span className="muted">{t('crm.phone')}</span>
                <span className="list__right"><a href={`tel:${o.clients?.phone}`}><b className="num">{o.clients?.phone}</b></a></span></div>
              <div className="list__row"><span className="muted">{t('crm.address')}</span>
                <span className="list__right"><b>{o.address ?? '—'}</b></span></div>
              {o.comment && <div className="list__row"><span className="muted">{t('crm.note')}</span>
                <span className="list__right" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{o.comment}</span></div>}
            </div>
          </div>

          {/* -------- смета -------- */}
          <div className="card">
            <div className="card__head"><h2 className="h2">{t('ord.works')}</h2>
              <b className="num">{money(o.quoted_total, lang)}</b></div>
            <div className="list">
              {items.map((i, n) => (
                <div className="list__row" key={n}>
                  <span style={{ minWidth: 0, flex: 1 }}>{i.name}</span>
                  <span className="muted num">×{i.qty}</span>
                  <span className="list__right num"><b>{money(i.sum, lang)}</b></span>
                </div>
              ))}
              {items.length === 0 && <p className="empty">{t('common.empty')}</p>}
            </div>
          </div>

          {/* -------- мастер и ход работы -------- */}
          <div className="card">
            <div className="card__head"><h2 className="h2">{t('ord.master')}</h2>
              {me.role !== 'master' && (o.status === 'new' || o.status === 'offered') && (
                <button className="btn btn--ghost btn--sm" onClick={() => setAssign(true)}>{t('att.assign')}</button>
              )}</div>
            {o.staff
              ? <div className="list__row">
                  <span className="avatar avatar--sm">{initials(o.staff.full_name)}</span>
                  <span><b>{o.staff.full_name}</b><small>{o.staff.phone ?? ''}</small></span>
                </div>
              : <p className="muted">{offer ? t('ord.offerWaiting') : t('common.none')}</p>}

            <hr className="hr" />
            <h3 className="h2" style={{ fontSize: '0.95rem', margin: '6px 0 10px' }}>{t('ord.timeline')}</h3>
            <div className="timeline">
              {events.map((e) => (
                <div className="timeline__row" key={e.id}>
                  <span className="timeline__dot" />
                  <span>
                    <b>{t(`ev.${e.type}`)}</b>
                    <small className="muted">
                      {' '}{e.staff?.full_name ?? ''}
                      {e.type === 'status' && e.payload?.status ? t(`ord.status.${e.payload.status}`) : ''}
                    </small>
                  </span>
                  <span className="tiny muted">{dateTime(e.at, lang)}</span>
                </div>
              ))}
              {events.length === 0 && <p className="muted tiny">{t('common.empty')}</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- */
/*  Карта: мастер → магазин → клиент                                 */
/* ---------------------------------------------------------------- */
function RouteCard({ order, me }: { order: any; me: Me }) {
  const { t } = useT()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const fromRef = useRef<Pt | null>(null)
  const toRef = useRef<Pt | null>(null)
  const shopMarks = useRef<Record<string, any>>({})
  /** Ключ точки: имя может повторяться (две Castorama), координаты — нет */
  const keyOf = (sh: Shop) => `${sh.point.lat.toFixed(5)},${sh.point.lon.toFixed(5)}`
  const [shops, setShops] = useState<Shop[]>([])
  const [picked, setPicked] = useState<Shop | null>(null)   // выбран, но маршрут ещё прежний
  const [via, setVia] = useState<Shop | null>(null)         // маршрут уже идёт через него
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /** Не ошибка, а пояснение: положения мастера нет, магазины не загрузились */
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Каждый шаг отдельно: если отвалится поиск магазинов, маршрут
      // и карта должны остаться. Раньше одна ошибка обрывала всю цепочку
      // и оставляла на экране голое «Failed to fetch».
      let map: any = null
      try {
        if (!box.current) return

        let to: Pt | null = order.lat && order.lon
          ? { lat: Number(order.lat), lon: Number(order.lon) }
          : null
        if (!to && order.address) {
          to = await geocode(order.address).catch(() => null)
          if (to) sb.rpc('set_order_coords', { o_id: order.id, p_lat: to.lat, p_lon: to.lon }).then(() => {})
        }
        if (!to) { setErr(t('ord.noAddress')); return }
        if (!alive) return

        map = await createMap(box.current, to, 13)
        if (!alive) { map.remove(); return }
        mapRef.current = map
        toRef.current = to
        marker(map, to, { color: ACCENT, glyph: 'K', title: order.address ?? '' })
      } catch (e) {
        setErr(`${t('ord.mapFail')} — ${(e as Error).message}`)
        return
      }

      // Откуда ехать: своё положение у мастера, последняя точка — у офиса
      let from: Pt | null = null
      try {
        if (me.role === 'master' && order.master_id === me.id) {
          const p = await currentPosition()
          if (p) from = { lat: p.lat, lon: p.lon }
        }
        if (!from && order.master_id) {
          const { data } = await sb.from('staff_locations').select('lat, lon')
            .eq('staff_id', order.master_id).maybeSingle()
          if (data) from = { lat: Number(data.lat), lon: Number(data.lon) }
        }
      } catch { /* положение мастера — не повод ломать карту */ }

      if (!from) { setNote(t('ord.noMasterPoint')); return }
      if (!alive) return
      fromRef.current = from
      marker(map, from, { color: FOREST, glyph: 'M', title: t('ord.master') })

      const r = await fetchRoute(from, toRef.current!)
      if (!alive) return
      setRoute(r)
      if (r.offline) setNote(t('ord.routeOffline'))
      drawRoute(map, r.coords, r.approx)

      try {
        const found = await shopsNear(from, toRef.current!)
        if (!alive) return
        setShops(found)
        found.forEach((sh, i) => {
          shopMarks.current[keyOf(sh)] = marker(map, sh.point, {
            color: '#ffffff', glyph: String(i + 1), title: `${sh.name} · ${sh.address}`,
          })
        })
      } catch {
        setNote(t('ord.shopsFail'))
      }
    })()
    return () => { alive = false; mapRef.current?.remove?.() }
  }, [order.id])

  /** Выбор магазина: подсвечиваем метку и подводим к ней карту.
   *  Маршрут при этом не трогаем — его перестраивают кнопкой,
   *  чтобы случайное касание не меняло дорогу. */
  function choose(shop: Shop | null) {
    setPicked(shop)
    Object.entries(shopMarks.current).forEach(([key, mk]) => {
      const el = mk.getElement() as HTMLElement
      const on = shop ? key === keyOf(shop) : false
      el.classList.toggle('mapin--on', on)
    })
    if (shop && mapRef.current) {
      mapRef.current.easeTo({ center: [shop.point.lon, shop.point.lat], zoom: 14, duration: 500 })
    }
  }

  async function routeVia(shop: Shop | null) {
    const map = mapRef.current
    if (!map || !fromRef.current || !toRef.current) return
    setBusy(true)
    try {
      const r = await fetchRoute(fromRef.current, toRef.current, shop?.point ?? null)
      setRoute(r)
      setVia(shop)
      setNote(r.offline ? t('ord.routeOffline') : '')
      drawRoute(map, r.coords, r.approx)
    } finally { setBusy(false) }
  }

  const detour = via && route && route.legs.length > 1 ? route.total : null

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2 className="h2">{t('ord.route')}</h2>
          {route && (
            <p className="card__note">
              {route.total.km} km · {route.total.min} {t('dash.min')}
              {route.legs.length > 1 && ` (${route.legs.map((l) => `${l.km} km`).join(' + ')})`}
              {route.approx && ` · ${t('ord.approx')}`}
            </p>
          )}
        </div>
        {toRef.current && (
          <a className="btn btn--dark btn--sm" target="_blank" rel="noreferrer"
             href={navLink(toRef.current, order.address)}>
            {t('ord.navigate')} ↗
          </a>
        )}
      </div>

      <div className="map" ref={box} />
      {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
      {note && <p className="tiny muted" style={{ marginTop: 8 }}>{note}</p>}

      {shops.length > 0 && (
        <>
          <hr className="hr" />
          <h3 className="h2" style={{ fontSize: '0.95rem', margin: '4px 0 8px' }}>{t('ord.shop')}</h3>
          <div className="chips">
            {shops.map((sh, i) => (
              <button key={`${sh.name}-${sh.point.lat}`} className="chip"
                      data-on={picked && keyOf(picked) === keyOf(sh) || undefined}
                      onClick={() => choose(picked && keyOf(picked) === keyOf(sh) ? null : sh)}
                      title={sh.address}>
                {i + 1}. {sh.name} <span className="muted num">· +{sh.km} km</span>
              </button>
            ))}
          </div>

          {/* Выбранный магазин: адрес, крюк и явное действие */}
          {picked && (
            <div className="shoppick">
              <span style={{ minWidth: 0, flex: 1 }}>
                <b>{picked.name}</b>
                <small>{picked.address || '—'} · {t('ord.detour')} +{picked.km} km</small>
              </span>
              <span className="split">
                {via && keyOf(via) === keyOf(picked) ? (
                  <>
                    <span className="badge badge--mint">{t('ord.viaOn')}</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => routeVia(null)} disabled={busy}>
                      {t('ord.viaOff')}
                    </button>
                  </>
                ) : (
                  <button className="btn btn--primary btn--sm" onClick={() => routeVia(picked)} disabled={busy}>
                    {busy ? <span className="spin" /> : t('ord.viaBuild')}
                  </button>
                )}
                <a className="btn btn--ghost btn--sm" target="_blank" rel="noreferrer"
                   href={navLink(picked.point, `${picked.name} ${picked.address}`)}>
                  {t('ord.navigate')} ↗
                </a>
              </span>
            </div>
          )}

          {detour && (
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {t('ord.viaLegs')}: {route!.legs.map((l) => `${l.km} km / ${l.min} ${t('dash.min')}`).join(' → ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/*  Отчёт мастера                                                    */
/* ---------------------------------------------------------------- */
function ReportForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { t, lang } = useT()
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [mat, setMat] = useState('')
  const [noMat, setNoMat] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pct, setPct] = useState<{ master: number; tax: number }>({ master: 80, tax: 0 })

  useEffect(() => {
    sb.from('panel_settings').select('key, value').in('key', ['master_pct', 'tax_pct'])
      .then(({ data }) => {
        const m = data?.find((x) => x.key === 'master_pct')?.value ?? 80
        const tx = data?.find((x) => x.key === 'tax_pct')?.value ?? 0
        setPct({ master: Number(m), tax: Number(tx) })
      })
  }, [])

  const gross = (Number(cash) || 0) + (Number(card) || 0)
  const materials = noMat ? 0 : (Number(mat) || 0)
  const base = Math.max(gross - materials, 0)
  // Мастеру показываем только его долю: сколько остаётся фирме — не его дело
  const masterShare = Math.round(base * pct.master) / 100

  const needReceipt = !noMat && materials > 0 && !file

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (needReceipt) { setErr(t('ord.needReceipt')); return }
    setBusy(true); setErr('')
    try {
      let path: string | null = null
      if (file) {
        // Чек кладём в папку заказа: политика Storage пускает мастера
        // только в свою папку, а офис читает всё.
        path = `${orderId}/receipt-${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
        const up = await sb.storage.from('receipts').upload(path, file, { upsert: false })
        if (up.error) throw up.error
      }
      const { error } = await sb.rpc('finish_order', {
        o_id: orderId, cash: Number(cash) || 0, card: Number(card) || 0,
        materials, receipt: path, no_mat: noMat, note: note || null, photos: [],
      })
      if (error) throw error
      onDone()
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head"><h2 className="h2">{t('ord.report')}</h2></div>

      <div className="grid grid--2">
        <div className="field">
          <label>{t('ord.cash')}</label>
          <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>{t('ord.card')}</label>
          <input inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid--2">
        <div className="field">
          <label>{t('ord.materials')}</label>
          <input inputMode="decimal" value={mat} disabled={noMat}
                 onChange={(e) => setMat(e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>{t('ord.receipt')}</label>
          <input type="file" accept="image/*,application/pdf" capture="environment" disabled={noMat}
                 onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>

      <label className="split" style={{ gap: 8 }}>
        <input type="checkbox" checked={noMat} onChange={(e) => { setNoMat(e.target.checked); if (e.target.checked) { setMat(''); setFile(null) } }} />
        <span>{t('ord.noMaterials')}</span>
      </label>

      <div className="field">
        <label>{t('crm.note')}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="card" style={{ background: 'var(--paper)', boxShadow: 'none' }}>
        <div className="split">
          <span className="muted">{t('fin.gross')}</span>
          <b className="spacer num">{money2(gross, lang)}</b>
        </div>
        <div className="split">
          <span className="muted">{t('ord.materials')}</span>
          <b className="spacer num">− {money2(materials, lang)}</b>
        </div>
        <hr className="hr" />
        <div className="split">
          <span>{t('ord.masterEarns')} · {pct.master}%</span>
          <b className="spacer num" style={{ color: 'var(--accent-text)' }}>{money2(masterShare + materials, lang)}</b>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {money2(masterShare, lang)} {t('prof.earned').toLowerCase()} {materials > 0 && `+ ${money2(materials, lang)} ${t('ord.materials').toLowerCase()}`}
        </p>
      </div>

      {err && <p className="err">{err}</p>}
      {needReceipt && <p className="err">{t('ord.needReceipt')}</p>}

      <button className="btn btn--primary" disabled={busy || gross <= 0}>
        {busy ? <span className="spin" /> : t('ord.finish')}
      </button>
    </form>
  )
}

function ReportView({ report, me }: { report: any; me: Me }) {
  const { t, lang } = useT()
  const [link, setLink] = useState('')

  useEffect(() => {
    if (!report.receipt_path) return
    sb.storage.from('receipts').createSignedUrl(report.receipt_path, 3600)
      .then(({ data }) => setLink(data?.signedUrl ?? ''))
  }, [report.receipt_path])

  return (
    <div className="card">
      <div className="card__head"><h2 className="h2">{t('ord.report')}</h2>
        <span className="badge badge--dark">{dateTime(report.created_at, lang)}</span></div>

      <div className="grid grid--3">
        <div><p className="muted tiny">{t('fin.cash')}</p><b className="big num">{money(report.cash_amount, lang)}</b></div>
        <div><p className="muted tiny">{t('fin.card')}</p><b className="big num">{money(report.card_amount, lang)}</b></div>
        <div><p className="muted tiny">{t('ord.materials')}</p><b className="big num">{money(report.materials_cost, lang)}</b></div>
      </div>

      <hr className="hr" />

      <div className="list">
        <div className="list__row">
          <span>{t('ord.masterEarns')} · {report.master_pct}%</span>
          <span className="list__right num"><b style={{ color: 'var(--accent-text)' }}>{money2(report.master_share, lang)}</b></span>
        </div>
        {me.role === 'admin' && (
          <>
            <div className="list__row">
              <span>{t('ord.companyEarns')}</span>
              <span className="list__right num"><b>{money2(report.company_share, lang)}</b></span>
            </div>
            {Number(report.tax_amount) > 0 && (
              <div className="list__row">
                <span className="muted">{t('fin.tax')} · {report.tax_pct}%</span>
                <span className="list__right num">− {money2(report.tax_amount, lang)}</span>
              </div>
            )}
            <div className="list__row">
              <span><b>{t('fin.net')}</b></span>
              <span className="list__right num"><b>{money2(report.company_net, lang)}</b></span>
            </div>
          </>
        )}
      </div>

      {report.work_note && <p className="muted">{report.work_note}</p>}

      {report.no_materials
        ? <span className="badge badge--ghost">{t('ord.noMaterials')}</span>
        : link && <a className="btn btn--ghost btn--sm" href={link} target="_blank" rel="noreferrer">{t('ord.receipt')} ↗</a>}
    </div>
  )
}

