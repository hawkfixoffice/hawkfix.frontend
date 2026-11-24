import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { KEY_PAGES, groupWords, pathOf, settings } from '../../data/content'
import { useCatalog } from '../../lib/catalog'
import { calcQuote, formatMoney, type Selection } from '../../lib/quote'
import { fromWord, nameOf } from '../../lib/price'
import { looksLikeSearch, matchItems } from '../../lib/match'
import { CONTACT } from '../../lib/ui'
import { track } from '../../lib/track'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import WaDraft from '../calc/WaDraft'

/** «Что случилось?» → WhatsApp. Один и тот же блок в герое главной и в попапе
 *  на всех остальных кнопках WhatsApp.
 *
 *  Человек пишет своими словами. Пока он печатает, под полем всплывают
 *  подходящие работы из прайса — без цен: в герое цен нет. Выбранная работа
 *  ложится ниже строкой, и только там видны цена, количество и итог —
 *  человек проверяет и жмёт «Napisz na WhatsApp». Ничего не подошло —
 *  текст уходит описанием, мастер оценит.
 *
 *  Кнопка — готовая ссылка `wa.me` с сообщением: код `HF-XXXXX`, работы,
 *  итог, описание. В тот же момент фоном уходит черновик в базу (`lead`,
 *  `channel: 'wa'`) — он появляется в панели в блоке «WhatsApp ze strony»,
 *  и оператор превращает его в заказ по коду из чата. Лид не теряется,
 *  даже если человек передумает писать: черновик уже в панели. */
export default function WaComposer({ variant, initial, autoFocus = false }: {
  variant: 'hero' | 'modal'
  /** Работы, с которых начинаем (попап берёт их из калькулятора) */
  initial?: Selection[]
  autoFocus?: boolean
}) {
  const { locale } = usePage()
  const T = TEXT[locale] ?? TEXT.pl
  const { items, groups } = useCatalog()
  const [text, setText] = useState('')
  const [sel, setSel] = useState<Selection[]>(initial ?? [])
  const [focus, setFocus] = useState(false)
  const [active, setActive] = useState(-1)
  const [err, setErr] = useState(false)
  const [sent, setSent] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const uid = useId()
  const listId = `${uid}-list`

  useEffect(() => { if (autoFocus) field.current?.focus({ preventScroll: true }) }, [autoFocus])

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const chosen = useMemo(() => new Set(sel.map((s) => s.key)), [sel])
  const q = text.trim()
  const hits = useMemo(
    () => (q.length >= 3 ? matchItems(q, items, groups, groupWords, locale, 7).filter((i) => !chosen.has(i.key)) : []),
    [q, items, groups, locale, chosen],
  )
  const quote = useMemo(() => calcQuote(sel, items, settings, false), [sel, items])
  const open = focus && hits.length > 0
  const miss = q.length >= 3 && hits.length === 0 && matchItems(q, items, groups, groupWords, locale, 1).length === 0

  useEffect(() => { setActive(-1) }, [q])
  useEffect(() => { if (q || sel.length) setErr(false) }, [q, sel.length])
  // Сменилась смета или описание — прежний код больше не про это сообщение
  useEffect(() => { setSent('') }, [q, sel])

  function pick(key: string) {
    const it = byKey.get(key)
    if (!it) return
    setSel((v) => (v.some((s) => s.key === key) ? v : [...v, { key, qty: Math.max(1, it.min || 1) }]))
    track('item_add', locale)
    // «kran» — это был поиск, его чистим; «cieknie kran pod zlewem» — это
    // описание проблемы, оно уйдёт в сообщение вместе с работой
    if (looksLikeSearch(text)) setText('')
    setActive(-1)
    field.current?.focus({ preventScroll: true })
  }

  function setQty(key: string, qty: number) {
    const it = byKey.get(key)
    if (!it) return
    const min = Math.max(1, it.min || 1)
    const max = it.max || 99
    setSel((v) => (qty < min ? v.filter((s) => s.key !== key) : v.map((s) => (s.key === key ? { ...s, qty: Math.min(qty, max) } : s))))
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? hits.length - 1 : a - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active].key) }
    else if (e.key === 'Escape') { e.stopPropagation(); setFocus(false) }
  }

  const money = (n: number) => formatMoney(n, settings, locale)

  return (
    <div className="wabox" data-variant={variant} ref={box}
         onFocus={() => setFocus(true)}
         onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setFocus(false) }}>
      <label className="wabox__label" htmlFor={`${uid}-q`}>{T.label}</label>
      <div className="wabox__field" data-err={err || undefined}>
        <textarea
          id={`${uid}-q`} ref={field} rows={2} value={text} maxLength={600}
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          placeholder={T.placeholder}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={err || undefined} aria-describedby={`${uid}-hint`}
        />
        {open && (
          <ul className="wabox__hits" id={listId} role="listbox" aria-label={T.hitsLabel}>
            <li className="wabox__hitsHead" role="presentation">{T.hitsLabel}</li>
            {hits.map((i, n) => (
              <li key={i.key} id={`${listId}-${n}`} role="option" aria-selected={n === active}>
                {/* mousedown, а не click: иначе поле теряет фокус раньше и список закрывается */}
                <button type="button" tabIndex={-1} data-on={n === active || undefined}
                        onMouseDown={(e) => { e.preventDefault(); pick(i.key) }}>
                  <Icon name="plus" size={15} />
                  <span>{nameOf(i, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="wabox__hint" id={`${uid}-hint`} data-err={err || undefined} aria-live="polite">
        {err ? T.empty : miss ? T.miss : sel.length ? T.more : T.hint}
      </p>

      {/* Выбранные работы — здесь и только здесь видны цены */}
      {sel.length > 0 && (
        <div className="wabox__quote">
          <ul className="wabox__lines">
            {quote.lines.map((l) => (
              <li key={l.item.key}>
                <span className="wabox__ln">{nameOf(l.item, locale)}</span>
                <span className="wabox__step" role="group" aria-label={nameOf(l.item, locale)}>
                  <button type="button" aria-label={T.minus} onClick={() => setQty(l.item.key, l.qty - 1)}>
                    <Icon name={l.qty <= Math.max(1, l.item.min || 1) ? 'x' : 'minus'} size={14} />
                  </button>
                  <span className="num">{l.qty}{l.item.unit && l.item.unit !== 'szt' ? ` ${unitLabel(l.item.unit)}` : ''}</span>
                  <button type="button" aria-label={T.plus} onClick={() => setQty(l.item.key, l.qty + 1)}>
                    <Icon name="plus" size={14} />
                  </button>
                </span>
                <span className="wabox__lp num price">
                  {l.item.ptype === 'scope' ? (l.sum > 0 ? `${fromWord(locale)} ${money(l.sum)}` : T.byPhoto) : money(l.sum)}
                </span>
              </li>
            ))}
          </ul>
          <p className="wabox__total">
            <span>{T.total}</span>
            <b className="num price">{quote.hasScope ? `${fromWord(locale)} ` : ''}{money(quote.total)}</b>
          </p>
          {quote.minimumApplied && <p className="wabox__note">{T.minNote.replace('{min}', money(quote.minimum))}</p>}
          {quote.hasScope && <p className="wabox__note">{T.scopeNote}</p>}
        </div>
      )}

      <WaDraft
        quote={quote} urgent={false} comment={text}
        className="btn btn--primary btn--lg wabox__send"
        onEmpty={() => { setErr(true); field.current?.focus() }}
        onSent={setSent}
      >
        <Icon name="whatsapp" size={19} /> {T.send}
      </WaDraft>
      <p className="wabox__after" aria-live="polite">
        {sent ? T.sent.replace('{code}', sent) : T.after}
      </p>

      {variant === 'hero' ? (
        <Link className="wabox__alt" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
          {T.toCalc} <Icon name="arrowDown" size={15} />
        </Link>
      ) : (
        <a className="wabox__alt" href={CONTACT.whatsappHref} target="_blank" rel="noopener" data-wa="direct">
          {T.direct} <Icon name="arrowUpRight" size={15} />
        </a>
      )}
    </div>
  )
}

const unitLabel = (u: string) => (u === 'm2' ? 'm²' : u === 'mb' ? 'mb' : u === 'h' ? 'h' : u === 'km' ? 'km' : u === 'floor' ? '⇅' : u)

const TEXT: Record<string, Record<string, string>> = {
  pl: {
    label: 'Co się stało?', placeholder: 'Np. cieknie kran, trzeba powiesić lampę, złożyć szafę…',
    hitsLabel: 'Z cennika — dotknij, żeby dodać', hint: 'Pisz po swojemu — podpowiemy pracę z cennika.',
    more: 'Możesz dopisać szczegóły albo dodać kolejną pracę.',
    miss: 'Tego nie ma w cenniku — nic nie szkodzi. Wyślij opis, fachowiec wyceni.',
    empty: 'Napisz kilka słów, co się stało — albo wybierz pracę z podpowiedzi.',
    minus: 'Mniej', plus: 'Więcej', byPhoto: 'wycena po zdjęciu', total: 'Razem',
    minNote: 'Minimalna wizyta to {min} — dojazd uzupełnia koszt prac do minimum.',
    scopeNote: 'Część prac wyceniamy po zdjęciu — wyślesz je na czacie.',
    send: 'Napisz na WhatsApp', after: 'Otworzy się WhatsApp z gotową wiadomością i numerem zgłoszenia.',
    sent: 'Numer zgłoszenia: {code}. WhatsApp się nie otworzył? Dotknij przycisku jeszcze raz.',
    toCalc: 'Albo policz cenę sam w kalkulatorze', direct: 'Napisz bez formularza',
  },
  uk: {
    label: 'Що сталося?', placeholder: 'Напр. тече кран, треба повісити лампу, зібрати шафу…',
    hitsLabel: 'З прайсу — торкніться, щоб додати', hint: 'Пишіть своїми словами — підкажемо роботу з прайсу.',
    more: 'Можете дописати деталі або додати ще одну роботу.',
    miss: 'Цього немає в прайсі — нічого страшного. Надішліть опис, майстер оцінить.',
    empty: 'Напишіть кілька слів, що сталося, — або оберіть роботу з підказок.',
    minus: 'Менше', plus: 'Більше', byPhoto: 'оцінка за фото', total: 'Разом',
    minNote: 'Мінімальний виїзд — {min}: дорога добирає вартість робіт до мінімуму.',
    scopeNote: 'Частину робіт оцінюємо за фото — надішлете їх у чаті.',
    send: 'Написати у WhatsApp', after: 'Відкриється WhatsApp із готовим повідомленням і номером заявки.',
    sent: 'Номер заявки: {code}. WhatsApp не відкрився? Торкніться кнопки ще раз.',
    toCalc: 'Або порахуйте ціну самі в калькуляторі', direct: 'Написати без форми',
  },
  ru: {
    label: 'Что случилось?', placeholder: 'Напр. течёт кран, нужно повесить лампу, собрать шкаф…',
    hitsLabel: 'Из прайса — нажмите, чтобы добавить', hint: 'Пишите своими словами — подскажем работу из прайса.',
    more: 'Можете дописать детали или добавить ещё работу.',
    miss: 'Этого нет в прайсе — ничего страшного. Отправьте описание, мастер оценит.',
    empty: 'Напишите пару слов, что случилось, — или выберите работу из подсказок.',
    minus: 'Меньше', plus: 'Больше', byPhoto: 'оценка по фото', total: 'Итого',
    minNote: 'Минимальный выезд — {min}: дорога добирает стоимость работ до минимума.',
    scopeNote: 'Часть работ оцениваем по фото — пришлёте их в чате.',
    send: 'Написать в WhatsApp', after: 'Откроется WhatsApp с готовым сообщением и номером заявки.',
    sent: 'Номер заявки: {code}. WhatsApp не открылся? Нажмите кнопку ещё раз.',
    toCalc: 'Или посчитайте цену сами в калькуляторе', direct: 'Написать без формы',
  },
  en: {
    label: 'What happened?', placeholder: 'E.g. leaking tap, a lamp to hang, a wardrobe to assemble…',
    hitsLabel: 'From the price list — tap to add', hint: 'Use your own words — we will suggest the job from the price list.',
    more: 'Add details or another job if you like.',
    miss: 'That is not on the price list — no problem. Send the description and a specialist will price it.',
    empty: 'Write a few words about what happened — or pick a job from the suggestions.',
    minus: 'Fewer', plus: 'More', byPhoto: 'priced from a photo', total: 'Total',
    minNote: 'The minimum visit is {min} — travel tops the labour up to the minimum.',
    scopeNote: 'Some jobs are priced from a photo — send them in the chat.',
    send: 'Message us on WhatsApp', after: 'WhatsApp opens with a ready message and your request number.',
    sent: 'Request number: {code}. WhatsApp did not open? Tap the button again.',
    toCalc: 'Or work out the price yourself in the calculator', direct: 'Message without the form',
  },
}
