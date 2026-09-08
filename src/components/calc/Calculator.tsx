import { useEffect, useMemo, useRef, useState } from 'react'
import { chains, groupWords, groups, items, services, settings } from '../../data/content'
import { calcQuote, formatHours, formatMoney, suggestedChains } from '../../lib/quote'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import Picture from '../Picture'
import ItemRow from './ItemRow'
import { usePicker } from './usePicker'
import { useCountUp } from './useCountUp'
import LeadForm from './LeadForm'
import Collapse from '../Collapse'

/** Часто выбираемые работы — чтобы не листать 105 позиций ради лампочки. */
const POPULAR = [
  'tap', 'drain', 'bulb', 'socket', 'tv-mount', 'assembly-small',
  'picture', 'curtain-rail', 'door-adjust', 'washer-hookup', 'silicone', 'handle',
]

/** У каждой группы прайса есть страница услуги — берём с неё фотографию. */
const GROUP_PHOTO: Record<string, string> = Object.fromEntries(
  services.filter((s) => s.group && s.image).map((s) => [s.group as string, s.image as string]),
)

export default function Calculator() {
  const { locale, t } = usePage()
  const p = usePicker()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  // На телефоне смета и форма живут в нижнем листе, а не в колонке справа
  const [sheet, setSheet] = useState(false)
  const [near, setNear] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const quote = useMemo(() => calcQuote(p.selection, items, settings, p.urgent), [p.selection, p.urgent])
  const suggestions = useMemo(() => suggestedChains(p.selection, chains), [p.selection])
  const shownTotal = useCountUp(quote.total)

  // Подсветка только что добавленной строки в смете
  const prevKeys = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(p.selection.map((s) => s.key))
    const added = [...now].find((k) => !prevKeys.current.has(k))
    prevKeys.current = now
    if (!added) return
    setFlash(added)
    const id = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(id)
  }, [p.selection])

  // Нижняя панель с ценой нужна, только пока человек выбирает работы:
  // на остальной странице она бы просто закрывала контент.
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      rootMargin: '-12% 0px -12% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Лист закрывается по Esc и держит прокрутку страницы под собой
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [sheet])

  const q = query.trim().toLocaleLowerCase(locale)
  let found: typeof items | null = null
  if (q.length >= 2) {
    const byName = items.filter((i) => i.name[locale].toLocaleLowerCase(locale).includes(q))
    const byGroup = items.filter(
      (i) => !byName.includes(i) &&
        ((groups.find((g) => g.key === i.group)?.name[locale] ?? '').toLocaleLowerCase(locale).includes(q) ||
         (groupWords[i.group]?.[locale] ?? '').includes(q)),
    )
    found = [...byName, ...byGroup]
  }

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [])
  const popular = POPULAR.map((k) => byKey.get(k)).filter(Boolean) as typeof items
  const rowLabels = { add: t.a11y.add, minus: t.a11y.minus, plus: t.a11y.plus, remove: t.a11y.remove }

  return (
    <div className="calc" id="wycena" ref={root}>
      {/* ------------------------- выбор работ ------------------------- */}
      <div className="calc__pick">
        <div className="calc__search">
          <Icon name="search" size={19} />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder(locale)} aria-label={searchPlaceholder(locale)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t.a11y.close}>
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {p.restored && (
          <p className="calc__restored" role="status">
            <Icon name="check" size={15} />
            {settings.strings[locale].draftRestored}
            <button type="button" onClick={p.clear}>{clearLabel(locale)}</button>
          </p>
        )}

        {found ? (
          found.length ? (
            <ul className="ilist ilist--card">
              {found.map((i) => (
                <ItemRow
                  key={i.key} item={i} qty={p.qtyOf(i.key)} locale={locale} settings={settings}
                  onAdd={() => p.add(i.key, i.min)} onSet={(v) => p.setQty(i.key, v, i.min, i.max)}
                  labels={rowLabels}
                />
              ))}
            </ul>
          ) : (
            <p className="calc__empty">{settings.strings[locale].searchEmpty}</p>
          )
        ) : (
          <>
            <div className="calc__popular">
              <p className="calc__subhead">{popularLabel(locale)}</p>
              <div className="calc__chips">
                {popular.map((i) => {
                  const on = p.qtyOf(i.key) > 0
                  return (
                    <button
                      key={i.key} type="button" className="chip chip--pick" data-on={on}
                      onClick={() => (on ? p.remove(i.key) : p.add(i.key, i.min))}
                      aria-pressed={on}
                    >
                      <Icon name={on ? 'check' : 'plus'} size={14} />
                      {i.name[locale]}
                      <span className="num">{i.price}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Группы: фото + счётчик выбранного. Нативные details работают без JS. */}
            <div className="calc__groups">
              {groups.map((g) => {
                const list = items.filter((i) => i.group === g.key)
                if (!list.length) return null
                const chosen = list.filter((i) => p.qtyOf(i.key) > 0).length
                const from = Math.min(...list.map((i) => i.price))
                const photo = GROUP_PHOTO[g.key]
                const isOpen = open === g.key
                return (
                  <div key={g.key} className="grp" data-open={isOpen}>
                    <button
                      type="button" className="grp__head" aria-expanded={isOpen} aria-controls={`grp-${g.key}`}
                      onClick={() => setOpen(isOpen ? null : g.key)}
                    >
                      {photo && (
                        <span className="grp__thumb">
                          {/* Миниатюра рядом с названием группы — декоративная: пустой alt,
                              чтобы скринридер не читал текст дважды. */}
                          <Picture name={photo} alt="" ratio="3x2" widths={[800]} sizes="64px" />
                        </span>
                      )}
                      <span className="grp__text">
                        <span className="grp__name">{g.name[locale] ?? g.key}</span>
                        <span className="grp__meta num">
                          {t.prices.from} {from} {settings.currency} · {list.length} {t.prices.positions}
                        </span>
                      </span>
                      {chosen > 0 && <span className="grp__badge num">{chosen}</span>}
                      <Icon name="chevron" size={18} className="grp__chev" />
                    </button>
                    <Collapse open={isOpen} id={`grp-${g.key}`}>
                    <ul className="ilist">
                      {list.map((i) => (
                        <ItemRow
                          key={i.key} item={i} qty={p.qtyOf(i.key)} locale={locale} settings={settings}
                          onAdd={() => p.add(i.key, i.min)} onSet={(v) => p.setQty(i.key, v, i.min, i.max)}
                          labels={rowLabels}
                        />
                      ))}
                    </ul>
                    </Collapse>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {suggestions.map(({ chain, missing }) => (
          <div className="chainbox" key={chain.key}>
            <p className="chainbox__title"><Icon name="sparkles" size={17} /> {chain.name[locale]}</p>
            <p className="chainbox__unless">{chain.unless[locale]}</p>
            <div className="chainbox__steps">
              {missing.map((k) => {
                const i = byKey.get(k)
                if (!i) return null
                return (
                  <button key={k} type="button" className="chip chip--accent" onClick={() => p.add(k, i.min)}>
                    <Icon name="plus" size={14} /> {i.name[locale]}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* --------------------------- смета ---------------------------
          На десктопе — липкая колонка справа. На телефоне тот же блок
          превращается стилями в нижний лист: разметка и состояние одни,
          дублировать форму во второй экземпляр не нужно. */}
      {sheet && (
        <button
          type="button" className="calcsheet__back" aria-label={t.a11y.close}
          onClick={() => setSheet(false)}
        />
      )}
      <aside
        className="calc__sum" aria-label={t.home.calcLabel}
        data-open={sheet || undefined}
        role={sheet ? 'dialog' : undefined}
        aria-modal={sheet ? true : undefined}
      >
        <div className="sum">
          <div className="sum__head">
            <p className="calc__subhead">{t.home.calcLabel}</p>
            {quote.count > 0 && !sent && (
              <button type="button" className="sum__clear" onClick={p.clear}>{clearLabel(locale)}</button>
            )}
            <button
              type="button" className="sum__close" onClick={() => setSheet(false)} aria-label={t.a11y.close}
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          {sent ? null : quote.lines.length === 0 ? (
            <p className="sum__empty">{settings.strings[locale].submitEmpty}</p>
          ) : (
            <ul className="sum__lines">
              {quote.lines.map((l) => (
                <li key={l.item.key} data-flash={flash === l.item.key ? 'yes' : undefined}>
                  <span className="sum__ln">{l.item.name[locale]}</span>
                  <span className="sum__lq num">×{l.qty}</span>
                  <span className="sum__lp num">{formatMoney(l.sum, settings, locale)}</span>
                  <button
                    type="button" onClick={() => p.remove(l.item.key)}
                    aria-label={`${t.a11y.remove}: ${l.item.name[locale]}`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!sent && (
            <label className="sum__urgent">
              <input type="checkbox" checked={p.urgent} onChange={(e) => p.setUrgent(e.target.checked)} />
              <span>{t.form.urgent}</span>
              {quote.urgentFee > 0 && <span className="num">+{formatMoney(quote.urgentFee, settings, locale)}</span>}
            </label>
          )}

          {!sent && quote.minimumApplied && (
            <p className="sum__note">
              <Icon name="shield" size={15} />
              {settings.strings[locale].minNote?.replace('{minValue}', formatMoney(quote.minimum, settings, locale))}
            </p>
          )}

          {!sent && (
            <div className="sum__total">
              <div>
                <p className="sum__totalLabel">{totalLabel(locale)}</p>
                <p className="sum__big num">{formatMoney(shownTotal, settings, locale)}</p>
              </div>
              <div className="sum__time">
                <Icon name="clock" size={15} />
                <span className="num">{formatHours(quote.hours, locale)}</span>
              </div>
            </div>
          )}

          <LeadForm quote={quote} urgent={p.urgent} onSent={() => { p.clear(); setSent(true) }} />
        </div>
      </aside>

      {/* Панель с ценой на телефоне: цена копится внизу, форма — по кнопке */}
      <div className="calcbar" data-show={near && !sheet && !sent ? 'true' : undefined}>
        <div className="calcbar__info">
          <span className="calcbar__label">
            {totalLabel(locale)}
            {quote.count > 0 && <> · {quote.count} {t.prices.positions}</>}
          </span>
          <span className="calcbar__sum num">{formatMoney(shownTotal, settings, locale)}</span>
        </div>
        <button type="button" className="btn btn--primary calcbar__go" onClick={() => setSheet(true)}>
          {settings.strings[locale].next} <Icon name="arrow" size={17} />
        </button>
      </div>
    </div>
  )
}

const searchPlaceholder = (l: string) =>
  l === 'pl' ? 'Szukaj: kran, żarówka, szafa…'
  : l === 'uk' ? 'Пошук: кран, лампочка, шафа…'
  : l === 'ru' ? 'Поиск: кран, лампочка, шкаф…'
  : 'Search: tap, bulb, wardrobe…'

const popularLabel = (l: string) =>
  l === 'pl' ? 'Najczęściej wybierane' : l === 'uk' ? 'Найчастіше обирають' : l === 'ru' ? 'Чаще всего выбирают' : 'Most often picked'

const clearLabel = (l: string) =>
  l === 'pl' ? 'Wyczyść' : l === 'uk' ? 'Очистити' : l === 'ru' ? 'Очистить' : 'Clear'

const totalLabel = (l: string) =>
  l === 'pl' ? 'Razem' : l === 'uk' ? 'Разом' : l === 'ru' ? 'Итого' : 'Total'
