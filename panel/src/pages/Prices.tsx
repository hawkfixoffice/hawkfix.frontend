import { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Modal from '../ui/Modal'

/**
 * Редактор прайса (только администратор).
 *
 * Слева — категории, справа — выбранная категория: её подкатегории и
 * позиции. Каждое поле сохраняется само, когда с него уходит фокус,
 * поэтому кнопки «Сохранить» нет. Цены и названия на сайте меняются
 * сразу: калькулятор и страница цен дочитывают прайс из базы.
 *
 * Тип цены:
 *   fixed — за штуку/услугу; area — за м² / погонный метр (клиент вводит
 *   площадь); scope — «за объём»: клиент прикладывает фото, мастер
 *   называет цену при принятии заказа или на месте. Цена у scope — это
 *   ориентир «от» (0 — «оценка по фото»).
 *
 * Права: писать в таблицы прайса может только is_admin() — это политика
 * базы, а не этот экран.
 */

const LOCS = ['pl', 'uk', 'ru', 'en'] as const
type Loc = (typeof LOCS)[number]
type Names = Partial<Record<Loc, string>>

interface Group { key: string; sort: number; name: Names }
interface Sub { key: string; group_key: string; sort: number; name: Names }
interface Item {
  key: string; group_key: string; subgroup_key: string | null; dept: string
  price: number; hours: number; unit: string; min_qty: number; max_qty: number
  extra: Record<string, unknown>; sort: number; ptype: 'fixed' | 'area' | 'scope'; name: Names
}

const UNITS = ['szt', 'm2', 'mb', 'h', 'km', 'floor']
const DEPTS = ['fix', 'clean', 'move', 'garden']
const PTYPES = ['fixed', 'area', 'scope'] as const

const names = (rows: { locale: string; name: string }[] | null | undefined): Names =>
  Object.fromEntries((rows ?? []).map((r) => [r.locale, r.name]))

/** Ключ из названия: латиница, дефисы, хвост против совпадений. */
const slug = (s: string, prefix: string) => {
  const base = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'x'
  return `${prefix}${base}-${Math.random().toString(36).slice(2, 6)}`
}

export default function Prices() {
  const { t } = useT()
  const [groups, setGroups] = useState<Group[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState<string>('')
  const [q, setQ] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)   // раскрытая позиция
  const [confirm, setConfirm] = useState<null | { kind: 'item' | 'subgroup' | 'group'; key: string; title: string; n?: number }>(null)
  const savedTimer = useRef<number>(0)
  /** Окно «как назвать» для новой категории, подкатегории и позиции */
  const [ask, setAsk] = useState<null | { title: string; go: (name: string) => void }>(null)

  async function load() {
    const [g, s, i] = await Promise.all([
      sb.from('price_groups').select('key, sort, price_group_tr(locale, name)').order('sort'),
      sb.from('price_subgroups').select('key, group_key, sort, price_subgroup_tr(locale, name)').order('sort'),
      sb.from('price_items').select('*, price_item_tr(locale, name)').order('sort'),
    ])
    const gs = (g.data ?? []).map((r: any) => ({ key: r.key, sort: r.sort, name: names(r.price_group_tr) }))
    setGroups(gs)
    setSubs((s.data ?? []).map((r: any) => ({ key: r.key, group_key: r.group_key, sort: r.sort, name: names(r.price_subgroup_tr) })))
    setItems((i.data ?? []).map((r: any) => ({
      ...r, hours: Number(r.hours), extra: r.extra ?? {}, name: names(r.price_item_tr),
    })))
    setSel((cur) => cur && gs.some((x) => x.key === cur) ? cur : gs[0]?.key ?? '')
  }
  useEffect(() => { load() }, [])

  /** Обёртка над любой записью: индикатор «сохраняю / сохранено» и ошибка. */
  async function write(p: PromiseLike<{ error: { message: string } | null }>) {
    setSaved('saving'); setErr('')
    const { error } = await p
    window.clearTimeout(savedTimer.current)
    if (error) { setSaved('err'); setErr(error.message); return false }
    setSaved('ok')
    savedTimer.current = window.setTimeout(() => setSaved('idle'), 1800)
    return true
  }

  const group = groups.find((g) => g.key === sel)
  const gSubs = subs.filter((s) => s.group_key === sel).sort((a, b) => a.sort - b.sort)
  const gItems = items.filter((i) => i.group_key === sel).sort((a, b) => a.sort - b.sort)

  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return null
    return items.filter((i) => Object.values(i.name).some((n) => n?.toLowerCase().includes(s)) || i.key.includes(s))
  }, [q, items])

  /* -------------------------- категории -------------------------- */
  async function addGroup(name: string) {
    const key = slug(name, 'g-')
    const sort = Math.max(0, ...groups.map((g) => g.sort)) + 1
    if (await write(sb.from('price_groups').insert({ key, sort }))) {
      await write(sb.from('price_group_tr').insert({ group_key: key, locale: 'pl', name }))
      await load(); setSel(key)
    }
  }
  async function renameGroup(key: string, loc: Loc, name: string) {
    const g = groups.find((x) => x.key === key)
    if (!g || (g.name[loc] ?? '') === name) return
    setGroups((v) => v.map((x) => x.key === key ? { ...x, name: { ...x.name, [loc]: name } } : x))
    await write(name
      ? sb.from('price_group_tr').upsert({ group_key: key, locale: loc, name })
      : sb.from('price_group_tr').delete().eq('group_key', key).eq('locale', loc))
  }
  async function moveGroup(key: string, dir: -1 | 1) {
    const list = [...groups].sort((a, b) => a.sort - b.sort)
    const i = list.findIndex((g) => g.key === key)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    const next = list.map((g, n) => ({ ...g, sort: n }))
    setGroups(next)
    await write(sb.from('price_groups').upsert(next.map(({ key: k, sort }) => ({ key: k, sort }))))
  }

  /* ------------------------ подкатегории ------------------------ */
  async function addSub(name: string) {
    if (!sel) return
    const key = slug(name, 'sg-')
    const sort = Math.max(0, ...gSubs.map((s) => s.sort)) + 1
    if (await write(sb.from('price_subgroups').insert({ key, group_key: sel, sort }))) {
      await write(sb.from('price_subgroup_tr').insert({ subgroup_key: key, locale: 'pl', name }))
      await load()
    }
  }
  async function renameSub(key: string, loc: Loc, name: string) {
    const s = subs.find((x) => x.key === key)
    if (!s || (s.name[loc] ?? '') === name) return
    setSubs((v) => v.map((x) => x.key === key ? { ...x, name: { ...x.name, [loc]: name } } : x))
    await write(name
      ? sb.from('price_subgroup_tr').upsert({ subgroup_key: key, locale: loc, name })
      : sb.from('price_subgroup_tr').delete().eq('subgroup_key', key).eq('locale', loc))
  }
  async function moveSub(key: string, dir: -1 | 1) {
    const list = [...gSubs]
    const i = list.findIndex((s) => s.key === key)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    const next = list.map((s, n) => ({ ...s, sort: n }))
    setSubs((v) => v.map((x) => next.find((y) => y.key === x.key) ?? x))
    await write(sb.from('price_subgroups').upsert(next.map(({ key: k, group_key, sort }) => ({ key: k, group_key, sort }))))
  }

  /* --------------------------- позиции --------------------------- */
  async function addItem(sub: string | null, name: string) {
    if (!sel) return
    const key = slug(name, '')
    const sort = Math.max(0, ...gItems.map((i) => i.sort)) + 1
    // Направление берём у соседей по категории — от него зависит минимум выезда
    const dept = gItems[0]?.dept ?? 'fix'
    const row = {
      key, group_key: sel, subgroup_key: sub, dept, price: 0, hours: 0.5, unit: 'szt',
      min_qty: 1, max_qty: 99, extra: {}, sort, ptype: 'fixed',
    }
    if (await write(sb.from('price_items').insert(row))) {
      await write(sb.from('price_item_tr').insert({ item_key: key, locale: 'pl', name }))
      await load(); setOpen(key)
    }
  }
  /** Поле позиции: оптимистично на экране, потом в базу. */
  async function setField(key: string, patch: Partial<Item>) {
    const cur = items.find((i) => i.key === key)
    if (!cur) return
    const changed = Object.entries(patch).some(([k, v]) => JSON.stringify((cur as any)[k]) !== JSON.stringify(v))
    if (!changed) return
    setItems((v) => v.map((i) => i.key === key ? { ...i, ...patch } : i))
    const { name: _n, ...db } = patch
    if (Object.keys(db).length) await write(sb.from('price_items').update(db).eq('key', key))
  }
  async function renameItem(key: string, loc: Loc, name: string) {
    const it = items.find((x) => x.key === key)
    if (!it || (it.name[loc] ?? '') === name) return
    setItems((v) => v.map((x) => x.key === key ? { ...x, name: { ...x.name, [loc]: name } } : x))
    await write(name
      ? sb.from('price_item_tr').upsert({ item_key: key, locale: loc, name })
      : sb.from('price_item_tr').delete().eq('item_key', key).eq('locale', loc))
  }
  async function moveItem(key: string, dir: -1 | 1) {
    const it = items.find((i) => i.key === key)
    if (!it) return
    const list = gItems.filter((i) => (i.subgroup_key ?? null) === (it.subgroup_key ?? null))
    const i = list.findIndex((x) => x.key === key)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    setItems((v) => v.map((x) => x.key === a.key ? { ...x, sort: b.sort } : x.key === b.key ? { ...x, sort: a.sort } : x))
    // сорт у соседей мог совпадать — тогда разводим явно
    const sa = b.sort === a.sort ? a.sort + dir : b.sort
    await write(sb.from('price_items').update({ sort: sa }).eq('key', a.key))
    await write(sb.from('price_items').update({ sort: a.sort }).eq('key', b.key))
  }

  async function doDelete() {
    if (!confirm) return
    const ok = await write(sb.rpc('price_delete', { p_kind: confirm.kind, p_key: confirm.key }) as any)
    setConfirm(null)
    if (ok) await load()
  }

  /* ---------------------------- вид ---------------------------- */
  const renderItems = (list: Item[]) => (
    <div className="pr-items">
      {list.map((i, n) => (
        <ItemRow
          key={i.key} item={i} first={n === 0} last={n === list.length - 1}
          open={open === i.key} onToggle={() => setOpen(open === i.key ? null : i.key)}
          groups={groups} subs={subs}
          onField={(p) => setField(i.key, p)} onName={(l, v) => renameItem(i.key, l, v)}
          onMove={(d) => moveItem(i.key, d)}
          onDelete={() => setConfirm({ kind: 'item', key: i.key, title: i.name.pl ?? i.key })}
        />
      ))}
      {list.length === 0 && <p className="muted tiny" style={{ padding: '8px 12px' }}>{t('pr.emptySection')}</p>}
    </div>
  )

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="h1">{t('pr.title')}</h1>
          <p className="sub">{t('pr.sub', { g: groups.length, i: items.length })}</p>
        </div>
        <div className="split">
          <span className={`pr-saved pr-saved--${saved}`} role="status">
            {saved === 'saving' ? t('pr.saving') : saved === 'ok' ? t('pr.saved') : saved === 'err' ? t('pr.error') : t('pr.live')}
          </span>
          <div className="field" style={{ minWidth: 240 }}>
            <input placeholder={t('pr.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="pr-legend">
        {PTYPES.map((p) => <span key={p} className="pr-type" data-t={p}>{t(`pr.type.${p}`)} — <small>{t(`pr.typeHint.${p}`)}</small></span>)}
      </div>

      {found ? (
        <div className="card card--flush">
          <div className="card__head" style={{ padding: '18px 20px 0' }}>
            <h2 className="h2">{t('pr.found', { n: found.length })}</h2>
            <button className="btn btn--ghost btn--sm" onClick={() => setQ('')}>✕</button>
          </div>
          {renderItems(found)}
        </div>
      ) : (
        <div className="pr">
          {/* ---------- категории ---------- */}
          <aside className="card pr-groups">
            <div className="card__head"><h2 className="h2">{t('pr.groups')}</h2></div>
            <div className="pr-glist">
              {[...groups].sort((a, b) => a.sort - b.sort).map((g, n, arr) => (
                <div key={g.key} className="pr-g" data-on={g.key === sel || undefined}>
                  <button type="button" className="pr-g__name" onClick={() => { setSel(g.key); setOpen(null) }}>
                    <span>{g.name.pl ?? g.key}</span>
                    <small className="num">{items.filter((i) => i.group_key === g.key).length}</small>
                  </button>
                  <span className="pr-arrows">
                    <button type="button" disabled={n === 0} onClick={() => moveGroup(g.key, -1)} aria-label="↑">↑</button>
                    <button type="button" disabled={n === arr.length - 1} onClick={() => moveGroup(g.key, 1)} aria-label="↓">↓</button>
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn--primary btn--sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setAsk({ title: t('pr.newGroupName'), go: addGroup })}>
              + {t('pr.addGroup')}
            </button>
          </aside>

          {/* ---------- выбранная категория ---------- */}
          <section className="grid">
            {group && (
              <div className="card">
                <div className="card__head">
                  <h2 className="h2">{group.name.pl ?? group.key}</h2>
                  <button className="btn btn--danger btn--sm"
                          onClick={() => setConfirm({ kind: 'group', key: group.key, title: group.name.pl ?? group.key, n: gItems.length })}>
                    {t('pr.delGroup')}
                  </button>
                </div>
                <NamesEditor value={group.name} onSave={(l, v) => renameGroup(group.key, l, v)} />
                <p className="tiny muted" style={{ margin: '10px 0 0' }}>{t('pr.skillsHint')}</p>
              </div>
            )}

            {group && gSubs.map((s, n) => {
              const list = gItems.filter((i) => i.subgroup_key === s.key)
              return (
                <div className="card card--flush" key={s.key}>
                  <div className="pr-subhead">
                    <input className="pr-subname" defaultValue={s.name.pl ?? ''} key={`${s.key}-${s.name.pl}`}
                           onBlur={(e) => renameSub(s.key, 'pl', e.target.value.trim())}
                           aria-label={t('pr.subName')} />
                    <span className="pr-arrows">
                      <button type="button" disabled={n === 0} onClick={() => moveSub(s.key, -1)}>↑</button>
                      <button type="button" disabled={n === gSubs.length - 1} onClick={() => moveSub(s.key, 1)}>↓</button>
                    </span>
                    <details className="pr-tr">
                      <summary>{t('pr.translations')}</summary>
                      <NamesEditor value={s.name} onSave={(l, v) => renameSub(s.key, l, v)} skipPl />
                    </details>
                    <button className="btn btn--ghost btn--sm" onClick={() => setAsk({ title: t('pr.newItemName'), go: (n) => addItem(s.key, n) })}>+ {t('pr.addItem')}</button>
                    <button className="btn btn--danger btn--sm"
                            onClick={() => setConfirm({ kind: 'subgroup', key: s.key, title: s.name.pl ?? s.key, n: list.length })}>✕</button>
                  </div>
                  {renderItems(list)}
                </div>
              )
            })}

            {group && (
              <div className="card card--flush">
                <div className="pr-subhead">
                  <b className="pr-subname pr-subname--static">{gSubs.length ? t('pr.noSub') : t('pr.items')}</b>
                  <button className="btn btn--ghost btn--sm" onClick={() => setAsk({ title: t('pr.newItemName'), go: (n) => addItem(null, n) })}>+ {t('pr.addItem')}</button>
                  <button className="btn btn--dark btn--sm" onClick={() => setAsk({ title: t('pr.newSubName'), go: addSub })}>+ {t('pr.addSub')}</button>
                </div>
                {renderItems(gItems.filter((i) => !i.subgroup_key || !gSubs.some((s) => s.key === i.subgroup_key)))}
              </div>
            )}
          </section>
        </div>
      )}

      {ask && <AskName title={ask.title} onClose={() => setAsk(null)} onOk={(n) => { setAsk(null); ask.go(n) }} />}

      {confirm && (
        <Modal title={t('pr.delTitle')} onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0 }}><b>{confirm.title}</b></p>
          <p className="muted">
            {confirm.kind === 'group' ? t('pr.delGroupWarn', { n: confirm.n ?? 0 })
              : confirm.kind === 'subgroup' ? t('pr.delSubWarn', { n: confirm.n ?? 0 })
              : t('pr.delItemWarn')}
          </p>
          <div className="split">
            <button className="btn btn--danger" onClick={doDelete}>{t('pr.delGo')}</button>
            <button className="btn btn--ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */

function AskName({ title, onClose, onOk }: { title: string; onClose: () => void; onOk: (name: string) => void }) {
  const { t } = useT()
  const [v, setV] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onOk(v.trim()) }}>
        <div className="field">
          <label>{t('pr.namePl')}</label>
          <input value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        </div>
        <p className="tiny muted">{t('pr.nameHint')}</p>
        <div className="split">
          <button className="btn btn--primary" disabled={!v.trim()}>{t('pr.create')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Названия на четырёх языках: польский обязателен, остальные — по желанию
 *  (пустой язык на сайте показывается польским). */
function NamesEditor({ value, onSave, skipPl = false }: { value: Names; onSave: (l: Loc, v: string) => void; skipPl?: boolean }) {
  return (
    <div className="pr-names">
      {LOCS.filter((l) => !(skipPl && l === 'pl')).map((l) => (
        <label className="pr-name" key={l}>
          <span>{l.toUpperCase()}</span>
          <input defaultValue={value[l] ?? ''} key={`${l}-${value[l] ?? ''}`}
                 onBlur={(e) => { const v = e.target.value.trim(); if (l !== 'pl' || v) onSave(l, v) }} />
        </label>
      ))}
    </div>
  )
}

function ItemRow({ item, first, last, open, onToggle, groups, subs, onField, onName, onMove, onDelete }: {
  item: Item; first: boolean; last: boolean; open: boolean; onToggle: () => void
  groups: Group[]; subs: Sub[]
  onField: (p: Partial<Item>) => void; onName: (l: Loc, v: string) => void
  onMove: (d: -1 | 1) => void; onDelete: () => void
}) {
  const { t } = useT()
  const num = (v: string, int = false) => {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? (int ? Math.round(n) : n) : 0
  }
  const extra = item.extra ?? {}

  return (
    <div className="pr-row" data-open={open || undefined} data-t={item.ptype}>
      <div className="pr-row__main">
        <input className="pr-row__name" defaultValue={item.name.pl ?? ''} key={`n-${item.name.pl}`}
               onBlur={(e) => { const v = e.target.value.trim(); if (v) onName('pl', v) }}
               aria-label={t('pr.name')} />
        <select className="pr-row__type" value={item.ptype} aria-label={t('pr.type')}
                onChange={(e) => {
                  const ptype = e.target.value as Item['ptype']
                  // «За м²» без площади не бывает: подставляем единицу сразу
                  onField(ptype === 'area' && !['m2', 'mb'].includes(item.unit) ? { ptype, unit: 'm2' } : { ptype })
                }}>
          {PTYPES.map((p) => <option key={p} value={p}>{t(`pr.type.${p}`)}</option>)}
        </select>
        <label className="pr-row__price">
          {item.ptype === 'scope' && <small>{t('pr.from')}</small>}
          <input inputMode="numeric" onFocus={(e) => e.target.select()} defaultValue={item.price} key={`p-${item.price}`}
                 onBlur={(e) => onField({ price: Math.max(0, num(e.target.value, true)) })}
                 aria-label={t('pr.price')} />
          <small>zł</small>
        </label>
        <select className="pr-row__unit" value={item.unit} onChange={(e) => onField({ unit: e.target.value })} aria-label={t('pr.unit')}>
          {UNITS.map((u) => <option key={u} value={u}>{t(`pr.u.${u}`)}</option>)}
        </select>
        <span className="pr-arrows">
          <button type="button" disabled={first} onClick={() => onMove(-1)}>↑</button>
          <button type="button" disabled={last} onClick={() => onMove(1)}>↓</button>
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onToggle} aria-expanded={open}>
          {open ? '▴' : '⋯'}
        </button>
        <button type="button" className="btn btn--danger btn--sm" onClick={onDelete} aria-label={t('pr.delTitle')}>✕</button>
      </div>

      {open && (
        <div className="pr-row__more">
          <NamesEditor value={item.name} onSave={onName} skipPl />
          <div className="pr-grid">
            <label className="field"><span className="flabel">{t('pr.hours')}</span>
              <input inputMode="decimal" onFocus={(e) => e.target.select()} defaultValue={item.hours} key={`h-${item.hours}`}
                     onBlur={(e) => onField({ hours: Math.max(0, num(e.target.value)) })} /></label>
            <label className="field"><span className="flabel">{t('pr.minQty')}</span>
              <input inputMode="numeric" onFocus={(e) => e.target.select()} defaultValue={item.min_qty} key={`mi-${item.min_qty}`}
                     onBlur={(e) => onField({ min_qty: Math.max(1, num(e.target.value, true)) })} /></label>
            <label className="field"><span className="flabel">{t('pr.maxQty')}</span>
              <input inputMode="numeric" onFocus={(e) => e.target.select()} defaultValue={item.max_qty} key={`ma-${item.max_qty}`}
                     onBlur={(e) => onField({ max_qty: Math.max(1, num(e.target.value, true)) })} /></label>
            <label className="field"><span className="flabel">{t('pr.dept')}</span>
              <select value={item.dept} onChange={(e) => onField({ dept: e.target.value })}>
                {DEPTS.map((d) => <option key={d} value={d}>{t(`pr.d.${d}`)}</option>)}
              </select></label>
            <label className="field"><span className="flabel">{t('pr.group')}</span>
              <select value={item.group_key}
                      onChange={(e) => onField({ group_key: e.target.value, subgroup_key: null })}>
                {groups.map((g) => <option key={g.key} value={g.key}>{g.name.pl ?? g.key}</option>)}
              </select></label>
            <label className="field"><span className="flabel">{t('pr.subLabel')}</span>
              <select value={item.subgroup_key ?? ''} onChange={(e) => onField({ subgroup_key: e.target.value || null })}>
                <option value="">—</option>
                {subs.filter((s) => s.group_key === item.group_key)
                  .map((s) => <option key={s.key} value={s.key}>{s.name.pl ?? s.key}</option>)}
              </select></label>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            <button type="button" className="chip" data-on={!!extra.a || undefined}
                    onClick={() => onField({ extra: { ...extra, a: extra.a ? undefined : true } })}>
              {t('pr.flagAddon')}
            </button>
            <button type="button" className="chip" data-on={!!extra.s || undefined}
                    onClick={() => onField({ extra: { ...extra, s: extra.s ? undefined : true } })}>
              {t('pr.flagSurvey')}
            </button>
          </div>
          <p className="tiny muted" style={{ margin: '8px 0 0' }}>{t(`pr.typeHint.${item.ptype}`)} · <code>{item.key}</code></p>
        </div>
      )}
    </div>
  )
}
