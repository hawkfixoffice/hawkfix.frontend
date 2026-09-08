import { useMemo, useState } from 'react'
import { chains, groupWords, groups, items, settings } from '../../data/content'
import { calcQuote, formatHours, formatMoney, suggestedChains } from '../../lib/quote'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import ItemRow from './ItemRow'
import { usePicker } from './usePicker'
import LeadForm from './LeadForm'

/** Часто выбираемые работы — чтобы не листать 105 позиций ради лампочки. */
const POPULAR = [
  'tap', 'drain', 'bulb', 'socket', 'tv-mount', 'assembly-small',
  'picture', 'curtain-rail', 'door-adjust', 'washer-hookup', 'silicone', 'handle',
]

export default function Calculator() {
  const { locale, t } = usePage()
  const p = usePicker()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const quote = useMemo(
    () => calcQuote(p.selection, items, settings, p.urgent),
    [p.selection, p.urgent],
  )
  const suggestions = useMemo(() => suggestedChains(p.selection, chains), [p.selection])

  // Ищем сначала по названию позиции, а если ничего — по словам из описания
  // услуги той же группы: люди пишут «kran», а позиция зовётся «bateria».
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
    <div className="calc" id="wycena">
      {/* ---------------- выбор работ ---------------- */}
      <div className="calc__pick">
        <div className="calc__search">
          <Icon name="search" size={19} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={settings.strings[locale].searchPlaceholder ?? searchPlaceholder(locale)}
            aria-label={searchPlaceholder(locale)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t.a11y.close}>
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {p.restored && (
          <p className="calc__restored" role="status">
            <Icon name="check" size={16} />
            {settings.strings[locale].draftRestored}
            <button type="button" onClick={p.clear}>{clearLabel(locale)}</button>
          </p>
        )}

        {found ? (
          found.length ? (
            <ul className="ilist">
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
            {/* быстрый старт */}
            <div className="calc__popular">
              <p className="label">{popularLabel(locale)}</p>
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

            {/* группы: нативные details — работают и без JS */}
            <div className="calc__groups">
              {groups.map((g) => {
                const list = items.filter((i) => i.group === g.key)
                if (!list.length) return null
                const chosen = list.filter((i) => p.qtyOf(i.key) > 0).length
                const from = Math.min(...list.map((i) => i.price))
                return (
                  <details
                    key={g.key} className="grp"
                    open={open === g.key}
                    onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? g.key : null)}
                  >
                    <summary>
                      <span className="grp__name">{g.name[locale] ?? g.key}</span>
                      {chosen > 0 && <span className="grp__badge num">{chosen}</span>}
                      <span className="grp__meta num">
                        {t.prices.from} {from} {settings.currency} · {list.length} {t.prices.positions}
                      </span>
                      <Icon name="chevron" size={18} className="grp__chev" />
                    </summary>
                    <ul className="ilist">
                      {list.map((i) => (
                        <ItemRow
                          key={i.key} item={i} qty={p.qtyOf(i.key)} locale={locale} settings={settings}
                          onAdd={() => p.add(i.key, i.min)} onSet={(v) => p.setQty(i.key, v, i.min, i.max)}
                          labels={rowLabels}
                        />
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          </>
        )}

        {/* подсказки-цепочки */}
        {suggestions.map(({ chain, missing }) => (
          <div className="chainbox" key={chain.key}>
            <p className="chainbox__title">
              <Icon name="sparkles" size={17} /> {chain.name[locale]}
            </p>
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

      {/* ---------------- смета ---------------- */}
      <aside className="calc__sum" aria-label={t.home.calcLabel}>
        <div className="sum">
          <div className="sum__head">
            <p className="label">{t.home.calcLabel}</p>
            {quote.count > 0 && !sent && (
              <button type="button" className="sum__clear" onClick={p.clear}>{clearLabel(locale)}</button>
            )}
          </div>

          {/* После успешной отправки смета уже очищена — не показываем пустой «0 zł» */}
          {sent ? null : quote.lines.length === 0 ? (
            <p className="sum__empty">{settings.strings[locale].submitEmpty}</p>
          ) : (
            <ul className="sum__lines">
              {quote.lines.map((l) => (
                <li key={l.item.key}>
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

          {!sent && <label className="sum__urgent">
            <input type="checkbox" checked={p.urgent} onChange={(e) => p.setUrgent(e.target.checked)} />
            <span>{t.form.urgent}</span>
            {quote.urgentFee > 0 && <span className="num">+{formatMoney(quote.urgentFee, settings, locale)}</span>}
          </label>}

          {!sent && quote.minimumApplied && (
            <p className="sum__note">
              <Icon name="shield" size={15} />
              {settings.strings[locale].minNote?.replace('{minValue}', formatMoney(quote.minimum, settings, locale))}
            </p>
          )}

          {!sent && <div className="sum__total">
            <div>
              <p className="stat__unit">{totalLabel(locale)}</p>
              <p className="sum__big num">{formatMoney(quote.total, settings, locale)}</p>
            </div>
            <div className="sum__time">
              <Icon name="clock" size={15} />
              <span className="num">{formatHours(quote.hours, locale)}</span>
            </div>
          </div>}

          <LeadForm quote={quote} urgent={p.urgent} onSent={() => { p.clear(); setSent(true) }} />
        </div>
      </aside>
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
