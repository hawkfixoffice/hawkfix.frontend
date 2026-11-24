import { useEffect, useMemo, useRef, useState } from 'react'
import { chains, groupWords, services, settings } from '../../data/content'
import { useCatalog } from '../../lib/catalog'
import { bySub, fromWord, minPrice, nameOf, priceText } from '../../lib/price'
import { calcQuote, formatHours, formatMoney, suggestedChains } from '../../lib/quote'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import Picture from '../Picture'
import ItemRow from './ItemRow'
import { usePicker } from './usePicker'
import { useCountUp } from './useCountUp'
import SparkDot from '../SparkDot'
import { firstName, readProfile } from '../../lib/profile'
import Collapse from '../Collapse'
import WaDraft from './WaDraft'
import { track } from '../../lib/track'
import { setQuoteContext } from '../../lib/wa'

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
  // Прайс живой: сначала запечённый в сборку, потом свежий из базы
  const { items, groups, subgroups } = useCatalog()
  const p = usePicker()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  // На телефоне смета и форма живут в нижнем листе, а не в колонке справа
  const [sheet, setSheet] = useState(false)
  const [near, setNear] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const sumRef = useRef<HTMLElement>(null)
  const barBtn = useRef<HTMLButtonElement>(null)
  // Имя из прошлой заявки. Читаем в эффекте, а не при рендере: страницы
  // статические, и localStorage на сервере нет — иначе разъедется гидрация.
  const [hello, setHello] = useState('')
  // Отправка — только в WhatsApp (2026-11-24): описание к смете и код заявки
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState(false)
  const [sentCode, setSentCode] = useState('')

  // Дату больше не выбирают на сайте — день и срочность согласуются в чате,
  // поэтому надбавку в смету не включаем (старый черновик мог хранить urgent)
  const quote = useMemo(() => calcQuote(p.selection, items, settings, false), [p.selection, items])
  const suggestions = useMemo(() => suggestedChains(p.selection, chains), [p.selection])
  const shownTotal = useCountUp(quote.total)

  useEffect(() => {
    const p = readProfile()
    if (p) setHello(firstName(p.name))
  }, [])
  useEffect(() => { if (note.trim() || p.selection.length) setNoteErr(false) }, [note, p.selection.length])
  useEffect(() => { setSentCode('') }, [note, p.selection])

  // Подсветка только что добавленной строки в смете
  const prevKeys = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(p.selection.map((s) => s.key))
    const added = [...now].find((k) => !prevKeys.current.has(k))
    prevKeys.current = now
    if (!added) return
    track('item_add', locale)
    setFlash(added)
    const id = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(id)
  }, [p.selection])

  // Нижняя панель с ценой нужна, только пока человек выбирает работы:
  // на остальной странице она бы просто закрывала контент.
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      setNear(e.isIntersecting)
      if (e.isIntersecting) track('calc_seen', locale)
    }, {
      rootMargin: '-12% 0px -12% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Лист закрывается по Esc и держит прокрутку страницы под собой.
  // Фокус уходит внутрь листа и возвращается на кнопку панели после закрытия:
  // иначе клавиатура и скринридер оставались «за» листом.
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Лист въезжает с `visibility: hidden` → `visible` (300 мс): фокус,
    // поставленный раньше, браузер молча сбрасывает
    const id = window.setTimeout(() => {
      const box = sumRef.current
      const first = box?.querySelector<HTMLElement>('textarea:not([disabled]), input:not([type=hidden]):not([disabled])')
      ;(first ?? box)?.focus({ preventScroll: true })
    }, 320)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      barBtn.current?.focus({ preventScroll: true })
    }
  }, [sheet])

  // Любая кнопка WhatsApp на странице (шапка, подвал) отправит и эту смету
  const ctxLines = quote.lines.map((l) => `• ${nameOf(l.item, locale)} ×${l.qty}`).join('\n')
  const ctxTotal = quote.lines.length ? `${quote.hasScope ? `${fromWord(locale)} ` : ''}${formatMoney(quote.total, settings, locale)}` : ''
  useEffect(() => {
    setQuoteContext(ctxLines ? { lines: ctxLines.split('\n'), total: ctxTotal, selection: p.selection } : null)
    return () => setQuoteContext(null)
  }, [ctxLines, ctxTotal, p.selection])

  // Быстрый выбор из героя главной: работа сразу ложится в смету
  useEffect(() => {
    const onPick = (e: Event) => {
      const key = (e as CustomEvent<string>).detail
      const it = items.find((i) => i.key === key)
      if (it && p.qtyOf(key) === 0) p.add(key, it.min)
    }
    window.addEventListener('hawkfix:pick', onPick)
    return () => window.removeEventListener('hawkfix:pick', onPick)
  }, [items, p.qtyOf, p.add])

  /** Работы нет в списке — к полю «что нужно сделать» под сметой. */
  function openDescribe() {
    if (q) setNote((v) => v || query.trim())
    if (window.matchMedia('(max-width: 900px)').matches) setSheet(true)
    else {
      sumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      requestAnimationFrame(() => document.getElementById('lf-comment')?.focus({ preventScroll: true }))
    }
  }

  const q = query.trim().toLocaleLowerCase(locale)
  let found: typeof items | null = null
  if (q.length >= 2) {
    const byName = items.filter((i) => nameOf(i, locale).toLocaleLowerCase(locale).includes(q))
    const byGroup = items.filter(
      (i) => !byName.includes(i) &&
        ((groups.find((g) => g.key === i.group)?.name[locale] ?? '').toLocaleLowerCase(locale).includes(q) ||
         (groupWords[i.group]?.[locale] ?? '').includes(q)),
    )
    found = [...byName, ...byGroup]
  }

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const popular = POPULAR.map((k) => byKey.get(k)).filter(Boolean) as typeof items
  const rowLabels = { add: t.a11y.add, minus: t.a11y.minus, plus: t.a11y.plus, remove: t.a11y.remove }
  const C = CALC_TEXT[locale] ?? CALC_TEXT.pl
  const byNameCount = found ? found.filter((i) => nameOf(i, locale).toLocaleLowerCase(locale).includes(q)).length : 0

  return (
    <div className="calc" ref={root}>
      {/* ------------------------- выбор работ ------------------------- */}
      <div className="calc__pick">
        {hello && (
          <p className="calc__hello">
            <span className="calc__helloDot"><SparkDot size={30} /></span>
            {greeting(locale, hello)}
          </p>
        )}

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
            <>
            {byNameCount === 0 && (
              <div className="calc__miss">
                <p>{C.related.replace('{q}', query.trim())}</p>
                <button type="button" className="btn btn--ghost calc__describe" onClick={openDescribe}>
                  <Icon name="sparkles" size={16} /> {C.describe}
                </button>
              </div>
            )}
            <ul className="ilist ilist--card">
              {found.map((i) => (
                <ItemRow
                  key={i.key} item={i} qty={p.qtyOf(i.key)} locale={locale} settings={settings}
                  onAdd={() => p.add(i.key, i.min)} onSet={(v) => p.setQty(i.key, v, i.min, i.max)}
                  labels={rowLabels}
                />
              ))}
            </ul>
            </>
          ) : (
            <div className="calc__miss calc__miss--none">
              <p>{C.none.replace('{q}', query.trim())}</p>
              <button type="button" className="btn btn--primary calc__describe" onClick={openDescribe}>
                {C.describe} <Icon name="arrow" size={16} />
              </button>
            </div>
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
                      {nameOf(i, locale)}
                      <span className="num">{i.ptype === 'scope' ? priceText(i, locale, settings).main : `${i.price} ${settings.currency}`}</span>
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
                const from = minPrice(list)
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
                          <span className="price">{t.prices.from} {from} {settings.currency}</span> · {nPositions(list.length, locale)}
                        </span>
                      </span>
                      {chosen > 0 && <span className="grp__badge num">{chosen}</span>}
                      <Icon name="chevron" size={18} className="grp__chev" />
                    </button>
                    <Collapse open={isOpen} id={`grp-${g.key}`}>
                    {bySub(list, subgroups.filter((x) => x.group === g.key)).map((part) => (
                      <div key={part.key || 'rest'}>
                        {part.name && <p className="ilist__sub">{nameOf({ name: part.name }, locale)}</p>}
                        <ul className="ilist">
                          {part.list.map((i) => (
                            <ItemRow
                              key={i.key} item={i} qty={p.qtyOf(i.key)} locale={locale} settings={settings}
                              onAdd={() => p.add(i.key, i.min)} onSet={(v) => p.setQty(i.key, v, i.min, i.max)}
                              labels={rowLabels}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
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
                    <Icon name="plus" size={14} /> {nameOf(i, locale)}
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
        className="calc__sum" aria-label={t.home.calcLabel} ref={sumRef} tabIndex={-1}
        data-open={sheet || undefined}
        role={sheet ? 'dialog' : undefined}
        aria-modal={sheet ? true : undefined}
      >
        <div className="sum">
          <div className="sum__head">
            <p className="calc__subhead">{t.home.calcLabel}</p>
            {quote.count > 0 && (
              <button type="button" className="sum__clear" onClick={p.clear}>{clearLabel(locale)}</button>
            )}
            <button
              type="button" className="sum__close" onClick={() => setSheet(false)} aria-label={t.a11y.close}
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          {quote.lines.length === 0 ? (
            <p className="sum__empty">{C.emptySum}</p>
          ) : (
            <ul className="sum__lines">
              {quote.lines.map((l) => (
                <li key={l.item.key} data-flash={flash === l.item.key ? 'yes' : undefined}>
                  <span className="sum__ln">{nameOf(l.item, locale)}</span>
                  <span className="sum__lq num">×{l.qty}</span>
                  <span className="sum__lp num">
                    {l.item.ptype === 'scope'
                      ? (l.sum > 0 ? `${fromWord(locale)} ${formatMoney(l.sum, settings, locale)}` : priceText(l.item, locale, settings).main)
                      : formatMoney(l.sum, settings, locale)}
                  </span>
                  <button
                    type="button" onClick={() => p.remove(l.item.key)}
                    aria-label={`${t.a11y.remove}: ${nameOf(l.item, locale)}`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {quote.lines.length > 0 && (
            <div className="rush">
              <span className="rush__text rush__text--off">
                <small>{RUSH[locale].replace('{pct}', String(settings.urgentPct)).replace('{max}', formatMoney(settings.urgentMax, settings, locale))}</small>
              </span>
            </div>
          )}

          {quote.hasScope && (
            <p className="sum__note sum__note--scope">
              <Icon name="sparkles" size={15} />
              {SCOPE_NOTE[locale]}
            </p>
          )}

          {quote.minimumApplied && (
            <p className="sum__note">
              <Icon name="shield" size={15} />
              {settings.strings[locale].minNote?.replace('{minValue}', formatMoney(quote.minimum, settings, locale))}
            </p>
          )}

          {quote.lines.length > 0 && (
            <div className="sum__total">
              <div>
                <p className="sum__totalLabel">{totalLabel(locale)}</p>
                <p className="sum__big num">
                  {quote.hasScope && <small className="sum__from">{fromWord(locale)} </small>}
                  {formatMoney(shownTotal, settings, locale)}
                </p>
              </div>
              <div className="sum__time" title={C.workTime}>
                <Icon name="clock" size={15} />
                <span className="num">{C.approx} {formatHours(quote.hours, locale)} {C.ofWork}</span>
              </div>
            </div>
          )}

          {/* Отправка: смета (или описание) с кодом уходит в чат WhatsApp,
              черновик — в панель. Адрес и день согласуются в переписке. */}
          <div className="calcsend">
            <label className="calcsend__label" htmlFor="lf-comment">
              {quote.lines.length ? C.addNote : C.whatToDo}
            </label>
            <textarea
              id="lf-comment" rows={quote.lines.length ? 2 : 3} value={note} maxLength={600}
              onChange={(e) => setNote(e.target.value)} placeholder={C.notePh}
              aria-invalid={noteErr || undefined} onFocus={() => track('form_start', locale)}
            />
            {noteErr && <p className="calcsend__err" role="alert">{C.noteErr}</p>}
            <WaDraft
              quote={quote} urgent={false} comment={note} className="btn btn--primary btn--lg calcsend__btn"
              onEmpty={() => { setNoteErr(true); document.getElementById('lf-comment')?.focus() }}
              onSent={setSentCode}
            >
              <Icon name="whatsapp" size={19} /> {quote.lines.length ? C.waSend : C.waDescribe}
            </WaDraft>
            <p className="calcsend__note" aria-live="polite">
              {sentCode ? C.sent.replace('{code}', sentCode) : C.waNote}
            </p>
          </div>
        </div>
      </aside>

      {/* Панель с ценой на телефоне: цена копится внизу, форма — по кнопке */}
      <div className="calcbar" data-show={near && !sheet ? 'true' : undefined} data-empty={quote.count === 0 || undefined}>
        {quote.count > 0 ? (
          <>
            <div className="calcbar__info">
              <span className="calcbar__label">
                {totalLabel(locale)} · {nPositions(quote.count, locale)}
                {quote.minimumApplied && <> · {C.minShort}</>}
              </span>
              <span className="calcbar__sum num">{quote.hasScope ? `${fromWord(locale)} ` : ''}{formatMoney(shownTotal, settings, locale)}</span>
            </div>
            <WaDraft quote={quote} urgent={false} comment={note} className="calcbar__wa" label={C.waSend}>
              <Icon name="whatsapp" size={22} />
            </WaDraft>
            <button ref={barBtn} type="button" className="btn btn--primary calcbar__go" onClick={() => setSheet(true)}>
              {C.order} <Icon name="arrow" size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="calcbar__info">
              <span className="calcbar__hint">{C.barHint}</span>
            </div>
            <WaDraft quote={quote} urgent={false} comment={note} className="calcbar__wa" label={C.waWrite}>
              <Icon name="whatsapp" size={22} />
            </WaDraft>
            <button ref={barBtn} type="button" className="btn btn--ghost calcbar__go calcbar__alt" onClick={openDescribe}>
              {C.describeShort}
            </button>
          </>
        )}
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

/** Срочность больше не выбирается на сайте — только объясняем правило */
const RUSH: Record<string, string> = {
  pl: 'Przyjazd dziś lub jutro: +{pct}% do wartości zlecenia (najwyżej {max}). Termin ustalimy na czacie.',
  uk: 'Приїзд сьогодні або завтра: +{pct}% до вартості (не більше {max}). Час узгодимо в чаті.',
  ru: 'Приезд сегодня или завтра: +{pct}% к стоимости (не больше {max}). Время согласуем в чате.',
  en: 'Visit today or tomorrow: +{pct}% on the order value (max {max}). We agree the time in the chat.',
}

/** Работы «за объём»: итог — ориентир, фото обязательно, цену назовёт мастер. */
const SCOPE_NOTE: Record<string, string> = {
  pl: 'Część prac wyceniamy po zdjęciu: wyślesz je na czacie WhatsApp, a fachowiec poda dokładną cenę przed rozpoczęciem pracy.',
  uk: 'Частину робіт оцінюємо за фото: надішлете їх у чаті WhatsApp, а майстер назве точну ціну до початку роботи.',
  ru: 'Часть работ оцениваем по фото: пришлёте их в чате WhatsApp, а мастер назовёт точную цену до начала работы.',
  en: 'Some jobs are priced from a photo: send them in the WhatsApp chat and the specialist gives the exact price before starting.',
}

/** Приветствие по имени из прошлой заявки — на языке страницы. */
const greeting = (l: string, name: string) =>
  l === 'pl' ? `Cześć, ${name}! Miło znów Cię widzieć.`
  : l === 'uk' ? `Привіт, ${name}! Раді бачити знову.`
  : l === 'ru' ? `Привет, ${name}! Рады видеть снова.`
  : `Hi, ${name}! Good to see you again.`

/** «1 pozycja / 3 pozycje / 12 pozycji» — подпись не берём из редактора:
 *  там она правится под счётчик на главной и с числами не согласуется. */
export function nPositions(n: number, l: string): string {
  const forms: Record<string, Record<string, string>> = {
    pl: { one: 'pozycja', few: 'pozycje', many: 'pozycji', other: 'pozycji' },
    uk: { one: 'позиція', few: 'позиції', many: 'позицій', other: 'позиції' },
    ru: { one: 'позиция', few: 'позиции', many: 'позиций', other: 'позиции' },
    en: { one: 'item', other: 'items' },
  }
  const f = forms[l] ?? forms.pl
  const cat = new Intl.PluralRules(l === 'uk' ? 'uk' : l).select(n)
  return `${n} ${f[cat] ?? f.other}`
}

const CALC_TEXT: Record<string, Record<string, string>> = {
  pl: {
    addNote: 'Coś dodać? (opcjonalnie)', whatToDo: 'Co trzeba zrobić?', notePh: 'Np. cieknie syfon pod zlewem, 3. piętro bez windy…',
    noteErr: 'Napisz kilka słów, co trzeba zrobić — albo zaznacz pracę z listy.', waDescribe: 'Opisz problem na WhatsApp',
    waNote: 'Otworzy się WhatsApp z kosztorysem i numerem zgłoszenia. Adres i termin ustalimy na czacie.',
    sent: 'Numer zgłoszenia: {code}. WhatsApp się nie otworzył? Dotknij przycisku jeszcze raz.',
    order: 'Zamów', barHint: 'Zaznacz pracę z listy albo opisz problem',
    describe: 'Opiszę problem własnymi słowami', describeShort: 'Opisz problem', waSend: 'Wyślij kosztorys na WhatsApp', waWrite: 'Napisz na WhatsApp',
    related: 'Nie mamy „{q}” wprost na liście. Zobacz podobne prace albo opisz problem — wycenimy osobno.',
    none: 'Nie mamy „{q}” na liście. Opisz problem własnymi słowami — wycenimy osobno i oddzwonimy.',
    emptySum: 'Zaznacz pracę z listy — cena pojawi się tutaj. Nie ma jej w cenniku? Opisz problem poniżej, wycenimy osobno.',
    minShort: 'minimum wyjazdu', approx: 'ok.', ofWork: 'pracy', workTime: 'Szacowany czas pracy na miejscu',
  },
  uk: {
    addNote: 'Щось додати? (необов’язково)', whatToDo: 'Що треба зробити?', notePh: 'Напр. тече сифон під мийкою, 3-й поверх без ліфта…',
    noteErr: 'Напишіть кілька слів, що треба зробити, — або позначте роботу зі списку.', waDescribe: 'Описати проблему у WhatsApp',
    waNote: 'Відкриється WhatsApp із кошторисом і номером заявки. Адресу й час узгодимо в чаті.',
    sent: 'Номер заявки: {code}. WhatsApp не відкрився? Торкніться кнопки ще раз.',
    order: 'Замовити', barHint: 'Позначте роботу зі списку або опишіть проблему',
    describe: 'Опишу проблему своїми словами', describeShort: 'Описати проблему', waSend: 'Надіслати кошторис у WhatsApp', waWrite: 'Написати у WhatsApp',
    related: 'Немає «{q}» прямо в списку. Перегляньте схожі роботи або опишіть проблему — оцінимо окремо.',
    none: 'Немає «{q}» у списку. Опишіть проблему своїми словами — оцінимо окремо й передзвонимо.',
    emptySum: 'Позначте роботу зі списку — ціна з’явиться тут. Немає в прайсі? Опишіть проблему нижче, оцінимо окремо.',
    minShort: 'мінімум виїзду', approx: '≈', ofWork: 'роботи', workTime: 'Орієнтовний час роботи на місці',
  },
  ru: {
    addNote: 'Что-то добавить? (необязательно)', whatToDo: 'Что нужно сделать?', notePh: 'Напр. течёт сифон под мойкой, 3-й этаж без лифта…',
    noteErr: 'Напишите пару слов, что нужно сделать, — или отметьте работу из списка.', waDescribe: 'Описать проблему в WhatsApp',
    waNote: 'Откроется WhatsApp со сметой и номером заявки. Адрес и время согласуем в чате.',
    sent: 'Номер заявки: {code}. WhatsApp не открылся? Нажмите кнопку ещё раз.',
    order: 'Заказать', barHint: 'Отметьте работу из списка или опишите проблему',
    describe: 'Опишу проблему своими словами', describeShort: 'Описать проблему', waSend: 'Отправить смету в WhatsApp', waWrite: 'Написать в WhatsApp',
    related: 'Нет «{q}» прямо в списке. Посмотрите похожие работы или опишите проблему — оценим отдельно.',
    none: 'Нет «{q}» в списке. Опишите проблему своими словами — оценим отдельно и перезвоним.',
    emptySum: 'Отметьте работу из списка — цена появится здесь. Нет в прайсе? Опишите проблему ниже, оценим отдельно.',
    minShort: 'минимум выезда', approx: '≈', ofWork: 'работы', workTime: 'Примерное время работы на месте',
  },
  en: {
    addNote: 'Anything to add? (optional)', whatToDo: 'What needs doing?', notePh: 'E.g. the sink trap is leaking, 3rd floor, no lift…',
    noteErr: 'Write a few words about the job — or pick one from the list.', waDescribe: 'Describe it on WhatsApp',
    waNote: 'WhatsApp opens with your estimate and request number. We agree the address and time in the chat.',
    sent: 'Request number: {code}. WhatsApp did not open? Tap the button again.',
    order: 'Order', barHint: 'Pick a job from the list or describe the problem',
    describe: 'I’ll describe it in my own words', describeShort: 'Describe it', waSend: 'Send the estimate on WhatsApp', waWrite: 'Message us on WhatsApp',
    related: '“{q}” is not on the list as such. See similar jobs or describe the problem — we will price it separately.',
    none: '“{q}” is not on the list. Describe the problem in your own words — we will price it and call back.',
    emptySum: 'Pick a job from the list — the price shows up here. Not in the price list? Describe the problem below and we will price it.',
    minShort: 'minimum charge', approx: '≈', ofWork: 'of work', workTime: 'Estimated time of work on site',
  },
}
