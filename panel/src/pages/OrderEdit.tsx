import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { sb, type Me } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { money } from '../lib/fmt'
import { suggestAddress, type AddrHit } from '../lib/maps'
import { SLOTS, fromOrder, loadPricing, nameOf, preview, toPayload,
         type CalcSettings, type Catalog, type CatItem, type Line } from '../lib/order'

/**
 * Одна страница на два случая.
 *
 * Новый заказ: клиент написал в WhatsApp или позвонил, и заказ заводит
 * сотрудник. Офис отдаёт его автоподбору или сразу мастеру, мастер заводит
 * на себя.
 *
 * Правка заказа: дата и окно, адрес, работы, срочность, комментарий.
 * На сервер уходит только то, что изменилось, — в ленте заказа остаётся
 * «было → стало», а не вся форма целиком.
 *
 * Суммы здесь предварительные: настоящие считает сервер по прайсу.
 */
export default function OrderEdit({ me }: { me: Me }) {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const { t, lang } = useT()

  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [settings, setSettings] = useState<CalcSettings | null>(null)
  const [order, setOrder] = useState<any>(null)
  const [ready, setReady] = useState(false)

  // клиент (только у нового заказа)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [known, setKnown] = useState<any>(null)
  const [source, setSource] = useState<'whatsapp' | 'phone' | 'other'>('whatsapp')
  const [master, setMaster] = useState('auto')
  const [masters, setMasters] = useState<{ id: string; full_name: string }[]>([])

  // общее
  const [addr, setAddr] = useState<{ text: string; district: string; lat: number | null; lon: number | null }>(
    { text: '', district: '', lat: null, lon: null })
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [urgent, setUrgent] = useState(false)
  const [applyMin, setApplyMin] = useState(true)
  const [comment, setComment] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /** Снимок формы на момент открытия — с ним сравниваем при сохранении */
  const initial = useRef<{ addr: string; date: string; slot: string; items: string; urgent: boolean; applyMin: boolean; comment: string } | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { catalog: c, settings: s } = await loadPricing()
        if (!alive) return
        setCatalog(c); setSettings(s)

        if (id) {
          const { data, error } = await sb.from('orders').select('*, clients(name, phone)').eq('id', id).maybeSingle()
          if (error) throw error
          if (!alive || !data) { setReady(true); return }
          const ls = fromOrder(data.items ?? [], c)
          setOrder(data)
          setAddr({ text: data.address ?? '', district: data.district ?? '', lat: data.lat, lon: data.lon })
          setDate(data.scheduled_date ?? '')
          setSlot(data.scheduled_slot ?? '')
          setLines(ls)
          setUrgent(Boolean(data.urgent))
          setApplyMin(!data.totals?.noMin)
          setComment(data.comment ?? '')
          initial.current = {
            addr: data.address ?? '', date: data.scheduled_date ?? '', slot: data.scheduled_slot ?? '',
            items: JSON.stringify(toPayload(ls)), urgent: Boolean(data.urgent),
            applyMin: !data.totals?.noMin, comment: data.comment ?? '',
          }
        } else if (me.role !== 'master') {
          const { data } = await sb.from('staff').select('id, full_name')
            .eq('role', 'master').eq('active', true).is('deleted_at', null).order('full_name')
          if (alive) setMasters(data ?? [])
        }
      } catch (e) {
        if (alive) setErr((e as Error).message)
      } finally { if (alive) setReady(true) }
    })()
    return () => { alive = false }
  }, [id])

  // Клиент по телефону: если человек уже обращался — подставляем имя и адрес
  const digits = phone.replace(/\D/g, '')
  useEffect(() => {
    if (editing || digits.length < 9) { setKnown(null); return }
    let alive = true
    const tm = window.setTimeout(async () => {
      const { data } = await sb.rpc('client_lookup', { p_phone: phone })
      if (!alive) return
      setKnown(data ?? null)
      if (data) {
        setName((v) => v || data.name || '')
        setAddr((v) => v.text ? v : { text: data.address ?? '', district: data.district ?? '', lat: data.lat ?? null, lon: data.lon ?? null })
      }
    }, 350)
    return () => { alive = false; window.clearTimeout(tm) }
  }, [digits, editing])

  const sum = useMemo(
    () => settings ? preview(lines, settings, urgent, applyMin) : null,
    [lines, settings, urgent, applyMin])

  if (!ready) return <p className="empty">{t('common.loading')}</p>
  if (editing && !order) return <p className="empty">{t('common.empty')}</p>

  const closed = editing && ['done', 'cancelled'].includes(order.status)
  const back = editing ? `/orders/${id}` : '/orders'

  async function submit() {
    setErr('')
    if (!editing && (!name.trim() || digits.length < 9)) { setErr(t('of.needClient')); return }
    if (lines.length === 0 && !comment.trim()) { setErr(t('of.needWork')); return }
    if (lines.some((l) => !l.key && !l.name.trim())) { setErr(t('of.needName')); return }

    setBusy(true)
    try {
      if (!editing) {
        const { data, error } = await sb.rpc('create_order', { payload: {
          client: { name: name.trim(), phone: phone.trim() },
          source, master: me.role === 'master' ? 'self' : master,
          address: addr.text.trim(), district: addr.district, lat: addr.lat, lon: addr.lon,
          date: date || null, slot: date ? slot || null : null,
          urgent, apply_min: applyMin, items: toPayload(lines), comment: comment.trim(),
        } })
        if (error) throw error
        nav(`/orders/${data.id}`, { replace: true })
        return
      }

      const was = initial.current!
      const patch: Record<string, unknown> = {}
      if (date !== was.date || (date ? slot : '') !== was.slot) { patch.date = date || null; patch.slot = date ? slot || null : null }
      if (addr.text.trim() !== was.addr.trim()) {
        patch.address = addr.text.trim(); patch.district = addr.district; patch.lat = addr.lat; patch.lon = addr.lon
      }
      if (comment.trim() !== was.comment.trim()) patch.comment = comment.trim()
      if (urgent !== was.urgent) patch.urgent = urgent
      if (applyMin !== was.applyMin) patch.apply_min = applyMin
      if (JSON.stringify(toPayload(lines)) !== was.items) patch.items = toPayload(lines)
      if (Object.keys(patch).length === 0) { setErr(t('of.nothing')); return }

      const { error } = await sb.rpc('update_order', { o_id: id, patch })
      if (error) throw error
      nav(back, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="page__head">
        <div>
          <Link className="btn btn--ghost btn--sm" to={back}>← {editing ? order.order_no : t('ord.title')}</Link>
          <h1 className="h1" style={{ marginTop: 10 }}>
            {editing ? `${t('of.editTitle')} · ${order.order_no}` : t('of.newTitle')}
          </h1>
          {editing && <p className="sub">{order.clients?.name} · {order.clients?.phone}</p>}
        </div>
      </div>

      {closed && <p className="notice" data-kind="quiet">{t('of.closed')}</p>}

      <div className="grid grid--wide-left oform" aria-disabled={closed || undefined}>
        <div className="grid">
          {!editing && (
            <div className="card">
              <div className="card__head"><h2 className="h2">{t('ord.client')}</h2>
                {known && <span className="badge badge--mint">{t('of.known', { n: known.orders_count ?? 0 })}</span>}</div>
              <div className="grid grid--2">
                <div className="field">
                  <label htmlFor="of-phone">{t('crm.phone')}</label>
                  <input id="of-phone" type="tel" inputMode="tel" autoComplete="off" value={phone}
                         onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 100 200" />
                </div>
                <div className="field">
                  <label htmlFor="of-name">{t('of.name')}</label>
                  <input id="of-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <span className="flabel">{t('of.source')}</span>
                <div className="chips">
                  {(['whatsapp', 'phone', 'other'] as const).map((s) => (
                    <button type="button" key={s} className="chip chip--lg" data-on={source === s || undefined}
                            onClick={() => setSource(s)}>{t(`of.src.${s}`)}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__head"><h2 className="h2">{t('of.whereWhen')}</h2></div>
            <AddressInput value={addr} onChange={setAddr} />

            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="of-date">{t('of.date')}</label>
                <input id="of-date" type="date" value={date}
                       onChange={(e) => { setDate(e.target.value); if (!e.target.value) setSlot('') }} />
              </div>
              {date && (
                <div className="field">
                  <span className="flabel">&nbsp;</span>
                  <button type="button" className="btn btn--ghost" onClick={() => { setDate(''); setSlot('') }}>
                    {t('of.noDate')}
                  </button>
                </div>
              )}
            </div>
            {date && (
              <div className="field">
                <span className="flabel">{t('of.slot')}</span>
                <div className="chips">
                  {SLOTS.map((s) => (
                    <button type="button" key={s} className="chip chip--lg num" data-on={slot === s || undefined}
                            onClick={() => setSlot(slot === s ? '' : s)}>{s.replace('-', '–')}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {catalog && <Works catalog={catalog} lines={lines} onChange={setLines} />}

          <div className="card">
            <div className="field">
              <label htmlFor="of-comment">{t('of.comment')}</label>
              <textarea id="of-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>
        </div>

        {/* -------- итог и отправка -------- */}
        <div className="grid">
          <div className="card osum">
            <div className="card__head"><h2 className="h2">{t('of.total')}</h2>
              <b className="big num">{money(sum?.total ?? 0, lang)}</b></div>

            {sum && (
              <div className="list">
                <div className="list__row"><span className="muted">{t('ord.works')}</span>
                  <span className="list__right num">{money(sum.labour, lang)}</span></div>
                {sum.minApplied && (
                  <div className="list__row"><span className="muted">{t('of.minApplied')}</span>
                    <span className="list__right num">+ {money(sum.minimum - sum.labour, lang)}</span></div>
                )}
                {sum.urgentFee > 0 && (
                  <div className="list__row"><span className="muted">{t('of.urgentFee')}</span>
                    <span className="list__right num">+ {money(sum.urgentFee, lang)}</span></div>
                )}
              </div>
            )}
            {sum?.hasScope && <p className="tiny muted" style={{ margin: 0 }}>{t('of.approx')}</p>}

            <label className="check">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              <span>{t('of.urgent', { pct: settings?.urgentPct ?? 50 })}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={applyMin} onChange={(e) => setApplyMin(e.target.checked)} />
              <span>{t('of.min')}</span>
            </label>

            {!editing && me.role !== 'master' && (
              <div className="field">
                <label htmlFor="of-master">{t('of.master')}</label>
                <select id="of-master" value={master} onChange={(e) => setMaster(e.target.value)}>
                  <option value="auto">{t('of.auto')}</option>
                  {masters.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            )}
            {!editing && me.role === 'master' && <p className="tiny muted" style={{ margin: 0 }}>{t('of.self')}</p>}

            {err && <p className="err" role="alert">{err}</p>}

            <button type="button" className="btn btn--primary osum__go" disabled={busy || closed} onClick={submit}>
              {busy ? <span className="spin" /> : editing ? t('of.save') : t('of.create')}
            </button>
            <Link className="btn btn--ghost" to={back}>{t('common.cancel')}</Link>
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- */
/*  Адрес с подсказками                                              */
/* ---------------------------------------------------------------- */
type Addr = { text: string; district: string; lat: number | null; lon: number | null }

/** Подсказки стоят в потоке под полем, а не всплывают поверх: всплывающий
 *  список уже дважды перехватывал чужие клики и обрезался контейнером
 *  (см. форму сайта), а здесь места достаточно. */
function AddressInput({ value, onChange }: { value: Addr; onChange: (a: Addr) => void }) {
  const { t } = useT()
  const [hits, setHits] = useState<AddrHit[]>([])
  const [open, setOpen] = useState(false)
  const typed = useRef(false)

  useEffect(() => {
    if (!typed.current) return
    const q = value.text.trim()
    if (q.length < 3) { setHits([]); return }
    const ctl = new AbortController()
    const tm = window.setTimeout(() => {
      suggestAddress(q, ctl.signal).then((h) => { setHits(h); setOpen(true) }).catch(() => {})
    }, 250)
    return () => { ctl.abort(); window.clearTimeout(tm) }
  }, [value.text])

  return (
    <div className="field">
      <label htmlFor="of-addr">{t('crm.address')}</label>
      <input id="of-addr" autoComplete="off" value={value.text} placeholder={t('of.addrHint')}
             onChange={(e) => {
               typed.current = true
               // Набранный руками текст точки не имеет: её даст подсказка или геокодер карты
               onChange({ text: e.target.value, district: '', lat: null, lon: null })
             }} />
      {open && hits.length > 0 && (
        <div className="addrlist" role="listbox" aria-label={t('crm.address')}>
          {hits.map((h) => (
            <button type="button" role="option" aria-selected="false" key={h.label} className="addrlist__row"
                    onClick={() => {
                      typed.current = false
                      onChange({ text: h.label, district: h.district, lat: h.lat, lon: h.lon })
                      setOpen(false)
                    }}>
              <b>{h.label}</b>{h.district && <small> · {h.district}</small>}
            </button>
          ))}
        </div>
      )}
      {value.lat != null && <span className="tiny" style={{ color: 'var(--accent-text)' }}>✓ {t('of.addrOk')}{value.district ? ` · ${value.district}` : ''}</span>}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/*  Работы: поиск по прайсу, количество, своя строка                 */
/* ---------------------------------------------------------------- */
function Works({ catalog, lines, onChange }: { catalog: Catalog; lines: Line[]; onChange: (l: Line[]) => void }) {
  const { t, lang } = useT()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [cName, setCName] = useState('')
  const [cPrice, setCPrice] = useState('')

  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s && !group) return []
    return catalog.items.filter((i) => {
      if (group && i.group !== group) return false
      if (!s) return true
      // ищем по всем языкам: менеджер может помнить работу по-русски
      return Object.values(i.name ?? {}).some((n) => n.toLowerCase().includes(s))
    }).slice(0, 40)
  }, [q, group, catalog])

  const qtyOf = (key: string) => lines.find((l) => l.key === key)?.qty ?? 0

  function add(i: CatItem) {
    if (qtyOf(i.key)) { setQty(lines.findIndex((l) => l.key === i.key), qtyOf(i.key) + 1); return }
    onChange([...lines, { key: i.key, name: nameOf(i.name, 'pl'), qty: 1, price: i.price, ptype: i.ptype, dept: i.dept }])
  }
  function setQty(n: number, qty: number) {
    if (qty <= 0) { onChange(lines.filter((_, k) => k !== n)); return }
    onChange(lines.map((l, k) => (k === n ? { ...l, qty: Math.min(qty, 9999) } : l)))
  }
  function addCustom() {
    const price = Number(cPrice.replace(',', '.'))
    if (!cName.trim() || !(price >= 0) || !cPrice.trim()) return
    onChange([...lines, { name: cName.trim(), qty: 1, price, ptype: 'custom' }])
    setCName(''); setCPrice('')
  }

  return (
    <div className="card">
      <div className="card__head"><h2 className="h2">{t('ord.works')}</h2>
        <span className="muted tiny">{lines.length || ''}</span></div>

      {/* выбранное */}
      {lines.length === 0 && <p className="muted tiny" style={{ margin: 0 }}>{t('of.empty')}</p>}
      <div className="olines">
        {lines.map((l, n) => (
          <div className="oline" key={l.key ?? `c${n}`}>
            <span className="oline__name">
              <b>{l.key ? nameOf(catalog.items.find((i) => i.key === l.key)?.name, lang) || l.name : l.name}</b>
              <small className="muted num">
                {l.ptype === 'scope' ? `${t('of.fromPhoto')} · ` : ''}{money(l.price, lang)}
                {l.ptype === 'custom' ? ` · ${t('of.custom').toLowerCase()}` : ''}
              </small>
            </span>
            <span className="stepper">
              <button type="button" aria-label="−" onClick={() => setQty(n, l.qty - 1)}>−</button>
              <input inputMode="decimal" aria-label={t('of.qty')} value={l.qty}
                     onFocus={(e) => e.target.select()}
                     onChange={(e) => setQty(n, Number(e.target.value.replace(',', '.')) || 1)} />
              <button type="button" aria-label="+" onClick={() => setQty(n, l.qty + 1)}>+</button>
            </span>
            <b className="oline__sum num">{money(l.price * l.qty, lang)}</b>
            <button type="button" className="btn btn--ghost btn--sm" aria-label={t('of.remove')}
                    onClick={() => setQty(n, 0)}>✕</button>
          </div>
        ))}
      </div>

      <hr className="hr" />

      {/* прайс */}
      <div className="field">
        <label htmlFor="of-q">{t('of.search')}</label>
        <input id="of-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('of.searchHint')} />
      </div>
      <div className="chips chips--scroll">
        {catalog.groups.map((g) => (
          <button type="button" key={g.key} className="chip" data-on={group === g.key || undefined}
                  onClick={() => setGroup(group === g.key ? '' : g.key)}>{nameOf(g.name, lang)}</button>
        ))}
      </div>
      {found.length > 0 && (
        <div className="picklist picklist--scroll">
          {found.map((i) => (
            <button type="button" key={i.key} className="pickitem" data-on={qtyOf(i.key) > 0 || undefined} onClick={() => add(i)}>
              <span className="pickitem__name">{nameOf(i.name, lang)}</span>
              <span className="muted num">{i.ptype === 'scope' ? `${t('of.fromPhoto')} ` : ''}{money(i.price, lang)}{i.unit && i.unit !== 'szt' ? ` / ${i.unit}` : ''}</span>
              <span className="pickitem__add">{qtyOf(i.key) > 0 ? `×${qtyOf(i.key)}` : '+'}</span>
            </button>
          ))}
        </div>
      )}
      {(q.trim() || group) && found.length === 0 && <p className="muted tiny" style={{ margin: 0 }}>{t('of.notFound')}</p>}

      <hr className="hr" />

      {/* своя строка */}
      <span className="flabel">{t('of.custom')}</span>
      <div className="ocustom">
        <div className="field">
          <input aria-label={t('of.customName')} value={cName} onChange={(e) => setCName(e.target.value)}
                 placeholder={t('of.customName')} />
        </div>
        <div className="field">
          <input aria-label={t('of.customPrice')} inputMode="decimal" value={cPrice}
                 onChange={(e) => setCPrice(e.target.value)} placeholder={t('of.customPrice')}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
        </div>
        <button type="button" className="btn btn--dark" onClick={addCustom}
                disabled={!cName.trim() || !cPrice.trim()}>{t('of.add')}</button>
      </div>
    </div>
  )
}
