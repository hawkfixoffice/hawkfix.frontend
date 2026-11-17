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
import LeadForm from './LeadForm'
import SparkDot from '../SparkDot'
import { firstName, readProfile } from '../../lib/profile'
import { useMorphHeight } from './useMorphHeight'
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
  // Прайс живой: сначала запечённый в сборку, потом свежий из базы
  const { items, groups, subgroups } = useCatalog()
  const p = usePicker()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  // На телефоне смета и форма живут в нижнем листе, а не в колонке справа
  const [sheet, setSheet] = useState(false)
  const [near, setNear] = useState(false)
  // «Опишу своими словами»: форма открывается с полем описания впереди
  const [describe, setDescribe] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const sumRef = useRef<HTMLElement>(null)
  const barBtn = useRef<HTMLButtonElement>(null)
  // Имя из прошлой заявки. Читаем в эффекте, а не при рендере: страницы
  // статические, и localStorage на сервере нет — иначе разъедется гидрация.
  const [hello, setHello] = useState('')
  // После отправки из карточки уходят строки сметы, срочность и итог —
  // без морфа высоты карточка схлопывалась рывком под улетевшим чеком
  const card = useMorphHeight<HTMLDivElement>(sentKey(sent))
  // Дату выбирают в форме, а надбавка за срочность — её следствие:
  // отдельная галочка «сегодня или завтра» спрашивала то же самое второй раз
  const [when, setWhen] = useState('')

  const quote = useMemo(() => calcQuote(p.selection, items, settings, p.urgent), [p.selection, p.urgent, items])
  const suggestions = useMemo(() => suggestedChains(p.selection, chains), [p.selection])
  const shownTotal = useCountUp(quote.total)

  useEffect(() => {
    const p = readProfile()
    if (p) setHello(firstName(p.name))
  }, [sent])

  const rush = isRush(when)
  useEffect(() => { p.setUrgent(rush) }, [rush])

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

  /** Работы нет в списке — открываем форму с полем «что нужно сделать». */
  function openDescribe() {
    setDescribe((n) => n + 1)
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
        <div className="sum" ref={card.ref} data-done={sent || undefined}>
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

          {!sent && quote.lines.length > 0 && (
            <div className="rush" data-on={rush || undefined}>
              {rush ? (
                <>
                  <span className="rush__ico"><Icon name="clock" size={16} /></span>
                  <span className="rush__text">
                    <b>{RUSH[locale].title}</b>
                    <small>
                      {RUSH[locale].note
                        .replace('{pct}', String(settings.urgentPct))
                        .replace('{max}', formatMoney(settings.urgentMax, settings, locale))}
                    </small>
                  </span>
                  {quote.urgentFee > 0 && (
                    <span className="rush__fee num">+{formatMoney(quote.urgentFee, settings, locale)}</span>
                  )}
                </>
              ) : (
                <span className="rush__text rush__text--off">
                  <small>{RUSH[locale].hint.replace('{pct}', String(settings.urgentPct))}</small>
                </span>
              )}
            </div>
          )}

          {!sent && quote.hasScope && (
            <p className="sum__note sum__note--scope">
              <Icon name="sparkles" size={15} />
              {SCOPE_NOTE[locale]}
            </p>
          )}

          {!sent && quote.minimumApplied && (
            <p className="sum__note">
              <Icon name="shield" size={15} />
              {settings.strings[locale].minNote?.replace('{minValue}', formatMoney(quote.minimum, settings, locale))}
            </p>
          )}

          {!sent && quote.lines.length > 0 && (
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

          <LeadForm
            quote={quote} urgent={p.urgent} onWhen={setWhen} describe={describe}
            onSent={() => { card.capture(); p.clear(); setSent(true) }}
          />
        </div>
      </aside>

      {/* Панель с ценой на телефоне: цена копится внизу, форма — по кнопке */}
      <div className="calcbar" data-show={near && !sheet && !sent ? 'true' : undefined} data-empty={quote.count === 0 || undefined}>
        {quote.count > 0 ? (
          <>
            <div className="calcbar__info">
              <span className="calcbar__label">
                {totalLabel(locale)} · {nPositions(quote.count, locale)}
                {quote.minimumApplied && <> · {C.minShort}</>}
              </span>
              <span className="calcbar__sum num">{quote.hasScope ? `${fromWord(locale)} ` : ''}{formatMoney(shownTotal, settings, locale)}</span>
            </div>
            <button ref={barBtn} type="button" className="btn btn--primary calcbar__go" onClick={() => setSheet(true)}>
              {C.order} <Icon name="arrow" size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="calcbar__info">
              <span className="calcbar__hint">{C.barHint}</span>
            </div>
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

/** Срочно — это «сегодня или завтра» по календарю устройства.
 *  Считаем по датам, а не по разнице в часах: заявка в 23:50 на завтра
 *  иначе оказалась бы «не срочной». */
function isRush(iso: string): boolean {
  if (!iso) return false
  const day = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(day.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000)
  return diff === 0 || diff === 1
}

/** Плашка надбавки за срочность: объясняет, откуда взялись деньги. */
const RUSH: Record<string, { title: string; note: string; hint: string }> = {
  pl: {
    title: 'Pilny przyjazd — dziś lub jutro',
    note: 'Doliczamy +{pct}% do wartości zlecenia, nie więcej niż {max}.',
    hint: 'Termin wybierasz w formularzu. Przyjazd dziś lub jutro: +{pct}%, od pojutrza bez dopłaty.',
  },
  uk: {
    title: 'Терміновий виїзд — сьогодні або завтра',
    note: 'Додаємо +{pct}% до вартості замовлення, але не більше ніж {max}.',
    hint: 'Дату обираєте у формі. Сьогодні або завтра: +{pct}%, з післязавтра без доплати.',
  },
  ru: {
    title: 'Срочный выезд — сегодня или завтра',
    note: 'Добавляем +{pct}% к стоимости заказа, но не больше {max}.',
    hint: 'Дату выбираете в форме. Сегодня или завтра: +{pct}%, с послезавтра без доплаты.',
  },
  en: {
    title: 'Rush visit — today or tomorrow',
    note: 'We add +{pct}% to the order value, capped at {max}.',
    hint: 'You pick the date in the form. Today or tomorrow: +{pct}%, from the day after — no surcharge.',
  },
}

/** Работы «за объём»: итог — ориентир, фото обязательно, цену назовёт мастер. */
const SCOPE_NOTE: Record<string, string> = {
  pl: 'Część prac wyceniamy po zdjęciu: w formularzu dodasz zdjęcia, a fachowiec poda dokładną cenę przed rozpoczęciem pracy.',
  uk: 'Частину робіт оцінюємо за фото: у формі додасте фото, а майстер назве точну ціну до початку роботи.',
  ru: 'Часть работ оцениваем по фото: в форме добавите фото, а мастер назовёт точную цену до начала работы.',
  en: 'Some jobs are priced from a photo: add photos in the form and the specialist gives the exact price before starting.',
}

/** Ключ морфа: играем переход ровно один раз — когда заявка ушла. */
const sentKey = (sent: boolean) => (sent ? 'sent' : 'form')

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
    order: 'Zamów', barHint: 'Zaznacz pracę z listy albo opisz problem',
    describe: 'Opiszę problem własnymi słowami', describeShort: 'Opisz problem',
    related: 'Nie mamy „{q}” wprost na liście. Zobacz podobne prace albo opisz problem — wycenimy osobno.',
    none: 'Nie mamy „{q}” na liście. Opisz problem własnymi słowami — wycenimy osobno i oddzwonimy.',
    emptySum: 'Zaznacz pracę z listy — cena pojawi się tutaj. Nie ma jej w cenniku? Opisz problem poniżej, wycenimy osobno.',
    minShort: 'minimum wyjazdu', approx: 'ok.', ofWork: 'pracy', workTime: 'Szacowany czas pracy na miejscu',
  },
  uk: {
    order: 'Замовити', barHint: 'Позначте роботу зі списку або опишіть проблему',
    describe: 'Опишу проблему своїми словами', describeShort: 'Описати проблему',
    related: 'Немає «{q}» прямо в списку. Перегляньте схожі роботи або опишіть проблему — оцінимо окремо.',
    none: 'Немає «{q}» у списку. Опишіть проблему своїми словами — оцінимо окремо й передзвонимо.',
    emptySum: 'Позначте роботу зі списку — ціна з’явиться тут. Немає в прайсі? Опишіть проблему нижче, оцінимо окремо.',
    minShort: 'мінімум виїзду', approx: '≈', ofWork: 'роботи', workTime: 'Орієнтовний час роботи на місці',
  },
  ru: {
    order: 'Заказать', barHint: 'Отметьте работу из списка или опишите проблему',
    describe: 'Опишу проблему своими словами', describeShort: 'Описать проблему',
    related: 'Нет «{q}» прямо в списке. Посмотрите похожие работы или опишите проблему — оценим отдельно.',
    none: 'Нет «{q}» в списке. Опишите проблему своими словами — оценим отдельно и перезвоним.',
    emptySum: 'Отметьте работу из списка — цена появится здесь. Нет в прайсе? Опишите проблему ниже, оценим отдельно.',
    minShort: 'минимум выезда', approx: '≈', ofWork: 'работы', workTime: 'Примерное время работы на месте',
  },
  en: {
    order: 'Order', barHint: 'Pick a job from the list or describe the problem',
    describe: 'I’ll describe it in my own words', describeShort: 'Describe it',
    related: '“{q}” is not on the list as such. See similar jobs or describe the problem — we will price it separately.',
    none: '“{q}” is not on the list. Describe the problem in your own words — we will price it and call back.',
    emptySum: 'Pick a job from the list — the price shows up here. Not in the price list? Describe the problem below and we will price it.',
    minShort: 'minimum charge', approx: '≈', ofWork: 'of work', workTime: 'Estimated time of work on site',
  },
}
