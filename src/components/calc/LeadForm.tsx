import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { Quote } from '../../lib/quote'
import { formatMoney } from '../../lib/quote'
import { settings, KEY_PAGES, pathOf } from '../../data/content'
import { usePage } from '../PageContext'
import { readProfile, saveProfile } from '../../lib/profile'
import type { AddressHit } from '../../lib/address'
import Icon from '../Icon'
import Lottie from '../Lottie'
import AddressField from './AddressField'
import { useMorphHeight } from './useMorphHeight'
import Receipt, { type ReceiptData } from './Receipt'
import { rid, toWebp } from '../../lib/webp'
import { fromWord, nameOf } from '../../lib/price'
import { SUPA_KEY, SUPA_URL, anonHeaders } from '../../lib/supa'

/** Адрес edge-функции. Значение публичное по назначению, поэтому дефолт зашит:
 *  без него сборка, собранная без переменной окружения, отправляла заявку
 *  «в никуда» и форма молча показывала ошибку. */
const ENDPOINT = import.meta.env.VITE_LEAD_ENDPOINT
  || 'https://vpijumbbmwjibvlohfug.supabase.co/functions/v1/lead'

/** Запасной путь — тот же приём заявки, но через PostgREST.
 *
 *  У части людей запросы к `functions/v1` не уходят из браузера вовсе
 *  (VPN, корпоративный DNS, блокировщик), при том что `rest/v1` того же
 *  проекта работает. Заявка тогда терялась, а человек видел «Не удалось
 *  отправить». Ключ публикуемый: он умеет ровно то, что разрешают политики,
 *  а из таблицы заявок ему доступен единственный вызов `submit_lead`. */
const RPC_ENDPOINT = `${SUPA_URL}/rest/v1/rpc/submit_lead`

/** Окна приезда по два часа: точное время бригада подтверждает звонком,
 *  а выбирать из 12 получасовых слотов человеку тяжело. */
const SLOTS = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00', '18:00-20:00']

type State = 'idle' | 'sending' | 'ok' | 'error'
/** Шаг «Фото» появляется, только если в смете есть работы «за объём»:
 *  их без фото не оценить, и мастер называет цену, глядя на снимки. */
const BASE_STEPS = ['who', 'where', 'when', 'send'] as const
const PHOTO_STEPS = ['who', 'photo', 'where', 'when', 'send'] as const
type Step = 'who' | 'photo' | 'where' | 'when' | 'send'
const MAX_PHOTOS = 6

interface Shot { path: string; url: string; size: number }

/** Заявка заполняется по шагам: контакты → адрес → время → детали.
 *  Раньше все восемь полей стояли одним экраном, и на телефоне форма
 *  занимала два с половиной экрана прокрутки. */
export default function LeadForm({ quote, urgent, onWhen, onSent }: {
  quote: Quote; urgent: boolean; onWhen: (iso: string) => void; onSent: () => void
}) {
  const { locale, t } = usePage()
  const T = STEP_TEXT[locale] ?? STEP_TEXT.pl
  const [state, setState] = useState<State>('idle')
  const [step, setStep] = useState<Step>('who')
  const [orderNo, setOrderNo] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [hit, setHit] = useState<AddressHit | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', comment: '', when: '', time: '' })
  // Фото клиента: грузим сразу при выборе, в заявку уходят только пути
  const [shots, setShots] = useState<Shot[]>([])
  const [shooting, setShooting] = useState(0)
  const [shotErr, setShotErr] = useState('')
  const [sid] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `${rid()}${rid()}-0000-4000-8000-${rid()}${rid()}`.slice(0, 36)))
  const STEPS: readonly Step[] = quote.hasScope ? PHOTO_STEPS : BASE_STEPS

  // Имя, телефон и адрес помним на устройстве — второй заказ короче первого
  useEffect(() => {
    const p = readProfile()
    if (!p) return
    setF((v) => ({
      ...v,
      name: v.name || p.name,
      phone: v.phone || p.phone || '',
      email: v.email || p.email || '',
      address: v.address || p.address || '',
    }))
  }, [])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }))
  const blur = (k: string) => () => setTouched((v) => ({ ...v, [k]: true }))

  const nameBad = !f.name.trim()
  const phoneBad = f.phone.replace(/\D/g, '').length < 9
  const emailBad = f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())
  const errName = touched.name && nameBad
  const errPhone = touched.phone && phoneBad
  const errEmail = touched.email && emailBad
  const empty = quote.lines.length === 0 && !f.comment.trim()

  const today = new Date()
  const minDate = today.toISOString().slice(0, 10)
  // Сегодняшние слоты, которые уже прошли, выбирать не из чего
  const slots = f.when === minDate
    ? SLOTS.filter((s) => Number(s.slice(0, 2)) > today.getHours())
    : SLOTS

  const idx = Math.max(0, STEPS.indexOf(step))
  // Позицию «за объём» убрали из сметы, пока человек был на шаге фото
  useEffect(() => { if (!STEPS.includes(step)) setStep('where') }, [STEPS, step])
  // Куда идём — от этого зависит, с какой стороны въезжает новый шаг
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  // Карточка меняет высоту вместе с шагом: без этого «Далее» дёргало
  // всю смету, а на телефоне лист прижат к низу и прыгал сильнее всего
  const stage = useMorphHeight<HTMLDivElement>(`${step}:${state}`)

  const go = (to: Step) => {
    setDir(STEPS.indexOf(to) < idx ? 'back' : 'fwd')
    stage.capture()
    setStep(to)
    // На невысоких экранах карточка прокручивается сама: показываем
    // начало нового шага, а не то место, где человек остановился
    requestAnimationFrame(() => {
      stage.ref.current?.closest('.calc__sum')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function next() {
    if (step === 'who') {
      setTouched((v) => ({ ...v, name: true, phone: true }))
      if (nameBad || phoneBad) return
      saveProfile({ name: f.name, phone: f.phone, email: f.email, address: f.address })
      // Следующий по списку: «Фото», если в смете работы «за объём», иначе «Адрес»
      return go(STEPS[idx + 1])
    }
    if (step === 'photo') {
      if (shooting) return
      if (!shots.length) { setShotErr(T.photoNeed); return }
      return go('where')
    }
    if (step === 'where') return go('when')
    if (step === 'when') return go('send')
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (step !== 'send') { next(); return }
    setTouched((v) => ({ ...v, name: true, phone: true }))
    if (nameBad || phoneBad) { go('who'); return }
    if (emailBad) { setTouched((v) => ({ ...v, email: true })); return }
    if (empty) return
    if (quote.hasScope && !shots.length) { setShotErr(T.photoNeed); go('photo'); return }

    saveProfile({ name: f.name, phone: f.phone, email: f.email, address: f.address })
    setState('sending')
    setReceipt(null)
    setShowReceipt(true)

    const payload = {
      locale, urgent,
      contact: { name: f.name, phone: f.phone, email: f.email },
      // Координаты берём из выбранной подсказки: по ним панель ставит точку
      // заказа на карту и строит маршрут мастеру
      place: { district: hit?.district ?? '', address: f.address, lat: hit?.lat ?? null, lon: hit?.lon ?? null },
      when: f.when,
      whenTime: f.time,
      comment: f.comment,
      items: quote.lines.map((l) => ({
        key: l.item.key, name: nameOf(l.item, locale), qty: l.qty, sum: l.sum,
        ...(l.item.ptype && l.item.ptype !== 'fixed' ? { ptype: l.item.ptype } : {}),
      })),
      totals: {
        labour: quote.labour, minimum: quote.minimum, urgentFee: quote.urgentFee, total: quote.total, hours: quote.hours,
        ...(quote.hasScope ? { approx: true } : {}),
      },
      photos: shots.map((x) => x.path),
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    }

    try {
      // Две попытки: мобильная сеть рвёт запросы чаще, чем кажется,
      // и терять заполненную заявку из-за одного обрыва нельзя
      let res: Response | null = null
      let netError: Error | null = null
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try {
          res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        } catch (e) {
          netError = e as Error
          await new Promise((r) => setTimeout(r, 700))
        }
      }

      // Функция недоступна из этого браузера — идём тем же запросом
      // через PostgREST. Письма отправит сама база.
      if (!res || res.status >= 500) {
        console.warn('[lead] функция недоступна, отправляем через RPC:', netError?.message ?? res?.status)
        res = await fetch(RPC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
          body: JSON.stringify({ payload: { ...payload, userAgent: navigator.userAgent } }),
        })
      }

      if (!res) throw netError ?? new Error('network')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json().catch(() => ({}))
      // RPC отвечает 200 и на отказ проверки — разбираем тело
      if (data?.error) throw new Error(String(data.error))
      const no = data?.orderNo ?? ''
      setOrderNo(no)
      // Чек печатается только после ответа: до него печатать нечего
      setReceipt({
        orderNo: no,
        name: f.name,
        phone: f.phone,
        address: f.address,
        when: showDate(f.when, locale),
        time: f.time.replace('-', ' – '),
        total: `${quote.hasScope ? `${fromWord(locale)} ` : ''}${formatMoney(quote.total, settings, locale)}`,
        hours: String(quote.hours),
        urgent,
        lines: quote.lines.map((l) => ({
          name: nameOf(l.item, locale), qty: l.qty, sum: formatMoney(l.sum, settings, locale),
        })),
      })
    } catch (e) {
      setShowReceipt(false)
      // «Failed to fetch» значит, что запрос не ушёл вовсе: обычно
      // виноват блокировщик, расширение приватности или VPN
      setBlocked(e instanceof TypeError)
      setState('error')
    }
  }

  /** Фото → WebP в браузере → бакет lead-photos. Браузер клиента может
   *  только положить файл (читать и перезаписывать — нет), видят фото
   *  офис и мастер, которому заказ предложен. */
  async function addShots(list: FileList | null) {
    if (!list?.length) return
    setShotErr('')
    const files = [...list].filter((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name))
      .slice(0, MAX_PHOTOS - shots.length - shooting)
    for (const file of files) {
      setShooting((n) => n + 1)
      try {
        const webp = await toWebp(file, 1600, 0.8)
        const path = `in/${sid}/${Date.now().toString(36)}-${rid()}.webp`
        const res = await fetch(`${SUPA_URL}/storage/v1/object/lead-photos/${path}`, {
          method: 'POST',
          headers: { ...anonHeaders, 'Content-Type': 'image/webp', 'x-upsert': 'false' },
          body: webp,
        })
        if (!res.ok) throw new Error(String(res.status))
        setShots((v) => [...v, { path, url: URL.createObjectURL(webp), size: webp.size }])
      } catch (e) {
        setShotErr((e as Error).message === 'webp' || (e as Error).message === 'format' ? T.photoFormat : T.photoFail)
      } finally {
        setShooting((n) => n - 1)
      }
    }
  }

  /** Чек долетел — показываем экран успеха и чистим смету. */
  function receiptDone() {
    setShowReceipt(false)
    setState('ok')
    // Высоту здесь морфит карточка сметы целиком (Calculator): из неё
    // разом уходят и строки сметы, и итог. Два морфа друг в друге дёргались.
    onSent()
  }

  const overlay = showReceipt && typeof document !== 'undefined'
    ? createPortal(<Receipt data={receipt} onDone={receiptDone} />, document.body)
    : null

  if (state === 'ok') {
    return (
      <div className="lead__stage" ref={stage.ref}>
        <div className="lead lead--ok" role="status">
          <Lottie name="check" size={72} className="lead__lottie"
                  still={<span className="lead__tick"><Icon name="check" size={22} /></span>} />
          <p className="lead__okTitle">{t.form.ok}</p>
          {orderNo && (
            <p className="lead__order">
              <span>{t.form.orderNo}</span>
              <b className="num">{orderNo}</b>
            </p>
          )}
          <p className="lead__okNote">{t.form.okNote}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lead__stage" ref={stage.ref}>
    <form className="lead lead--steps" onSubmit={submit} noValidate data-step={step}>
      {/* Шаги: где мы сейчас и куда можно вернуться */}
      <ol className="steps" aria-label={T.stepsLabel}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button" className="steps__dot" data-on={i <= idx || undefined}
              aria-current={s === step ? 'step' : undefined}
              onClick={() => i < idx && go(s)} disabled={i > idx}
            >
              <span className="steps__n num">{i + 1}</span>
              <span className="steps__t">{T[s]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="lead__step" key={step} data-dir={dir}>
      {step === 'who' && (
        <div className="lead__grid">
          <div className="field">
            <label htmlFor="lf-name">{t.form.name} *</label>
            <input
              id="lf-name" name="name" value={f.name} onChange={set('name')} onBlur={blur('name')}
              autoComplete="given-name" aria-invalid={errName || undefined}
              aria-describedby={errName ? 'lf-name-err' : undefined}
            />
            <p className="field__err" id="lf-name-err" data-empty={!errName || undefined}>{t.form.required}</p>
          </div>

          <div className="field">
            <label htmlFor="lf-phone">{t.form.phone} *</label>
            <input
              id="lf-phone" name="phone" type="tel" inputMode="tel" value={f.phone}
              onChange={set('phone')} onBlur={blur('phone')} autoComplete="tel"
              placeholder="+48 …" aria-invalid={errPhone || undefined}
              aria-describedby={errPhone ? 'lf-phone-err' : undefined}
            />
            <p className="field__err" id="lf-phone-err" data-empty={!errPhone || undefined}>{t.form.required}</p>
          </div>
        </div>
      )}

      {step === 'photo' && (
        <div className="lead__grid">
          <div className="field field--wide shots">
            <span className="field__label">{T.photoTitle} *</span>
            <p className="field__hint">{T.photoLead}</p>
            <ul className="shots__for">
              {quote.scopeLines.map((l) => <li key={l.item.key}>{nameOf(l.item, locale)}</li>)}
            </ul>
            <div className="shots__row">
              {shots.map((x, n) => (
                <span className="shots__item" key={x.path}>
                  <img src={x.url} alt="" />
                  <button type="button" aria-label={`${T.photoRemove} ${n + 1}`}
                          onClick={() => setShots((v) => v.filter((y) => y.path !== x.path))}>
                    <Icon name="x" size={14} />
                  </button>
                </span>
              ))}
              {Array.from({ length: shooting }).map((_, n) => (
                <span className="shots__item shots__item--busy" key={`busy-${n}`}><Lottie name="dots" size={26} loop /></span>
              ))}
              {shots.length + shooting < MAX_PHOTOS && (
                <label className="shots__add">
                  <Icon name="plus" size={20} />
                  <span>{T.photoAdd}</span>
                  <input
                    type="file" accept="image/*" multiple hidden
                    onChange={(e) => { addShots(e.target.files); e.target.value = '' }}
                  />
                </label>
              )}
            </div>
            <p className="field__err" data-empty={!shotErr || undefined} role={shotErr ? 'alert' : undefined}>{shotErr}</p>
          </div>
        </div>
      )}

      {step === 'where' && (
        <div className="lead__grid">
          <AddressField
            value={f.address} hit={hit}
            onChange={(v) => setF((x) => ({ ...x, address: v }))}
            onPick={setHit}
          />
        </div>
      )}

      {step === 'when' && (
        <div className="lead__grid">
          <div className="field field--wide">
            <label htmlFor="lf-when">{t.form.when}</label>
            <input
              id="lf-when" name="when" type="date" min={minDate} value={f.when}
              onChange={(e) => {
                setF((v) => ({ ...v, when: e.target.value, time: '' }))
                onWhen(e.target.value)
              }}
            />
          </div>

          {/* Слоты появляются только после выбора дня: без даты они бессмысленны */}
          {f.when && (
            <div className="field field--wide slots">
              <span className="field__label">{T.timeLabel}</span>
              {slots.length ? (
                <div className="slots__row" role="radiogroup" aria-label={T.timeLabel}>
                  {slots.map((s) => (
                    <button
                      key={s} type="button" className="slot" role="radio"
                      aria-checked={f.time === s} data-on={f.time === s || undefined}
                      onClick={() => setF((v) => ({ ...v, time: v.time === s ? '' : s }))}
                    >
                      {s.replace('-', ' – ')}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="field__hint">{T.noSlots}</p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'send' && (
        <div className="lead__grid">
          <div className="field field--wide">
            <label htmlFor="lf-email">
              {t.form.email} <span className="field__opt">{t.form.emailHint}</span>
            </label>
            <input
              id="lf-email" name="email" type="email" inputMode="email" value={f.email}
              onChange={set('email')} onBlur={blur('email')} autoComplete="email"
              placeholder="nazwa@example.com" aria-invalid={errEmail || undefined}
              aria-describedby={errEmail ? 'lf-email-err' : undefined}
            />
            <p className="field__err" id="lf-email-err" data-empty={!errEmail || undefined}>{t.form.emailBad}</p>
          </div>

          <div className="field field--wide">
            <label htmlFor="lf-comment">{t.form.comment}</label>
            <textarea id="lf-comment" name="comment" rows={3} value={f.comment} onChange={set('comment')} />
          </div>

          {/* Сводка того, что уже введено: последний шаг не должен требовать
              возврата назад ради проверки */}
          <ul className="lead__recap">
            <li><span>{t.form.name}</span><b>{f.name || '—'}</b></li>
            <li><span>{t.form.phone}</span><b className="num">{f.phone || '—'}</b></li>
            {f.address && <li><span>{t.form.address}</span><b>{f.address}</b></li>}
            {shots.length > 0 && <li><span>{T.photo}</span><b className="num">{shots.length}</b></li>}
            {f.when && <li><span>{t.form.when}</span><b className="num">{[showDate(f.when, locale), f.time.replace('-', ' – ')].filter(Boolean).join(' · ')}</b></li>}
          </ul>
        </div>
      )}
      </div>

      {state === 'error' && (
        <p className="field__err" role="alert">
          {t.form.error}
          {blocked && <> {blockedHint(locale)}</>}
        </p>
      )}

      <div className="lead__nav">
        {idx > 0 && (
          <button type="button" className="btn btn--ghost lead__back" onClick={() => go(STEPS[idx - 1])}>
            <Icon name="arrow" size={16} className="lead__backIcon" /> {T.back}
          </button>
        )}
        {step !== 'send' ? (
          <button type="button" className="btn btn--primary lead__submit" onClick={next}>
            {T.next} <Icon name="arrow" size={17} />
          </button>
        ) : (
          /* Кнопка намеренно `type="button"`, а отправка — в обработчике.
             С `type="submit"` последний шаг открывался и отправлялся одним
             кликом: React успевал сменить тип кнопки внутри обработчика
             click, и браузер выполнял действие по умолчанию — submit —
             уже для новой кнопки. */
          <button
            className="btn btn--primary lead__submit" type="button"
            onClick={() => submit()} disabled={state === 'sending'}
          >
            {state === 'sending' ? (
              <>
                <Lottie name="dots" size={26} loop className="lead__dots" />
                {t.form.sending}
              </>
            ) : (
              quote.total > 0
                ? `${t.form.submit} · ${quote.hasScope ? `${fromWord(locale)} ` : ''}${formatMoney(quote.total, settings, locale)}`
                : t.form.submit
            )}
          </button>
        )}
      </div>

      <p className="lead__consent">
        {t.form.agree}{' '}
        <Link to={pathOf(KEY_PAGES.privacy, locale)}>{privacyWord(locale)}</Link>.
      </p>

      {overlay}
    </form>
    </div>
  )
}

const STEP_TEXT: Record<string, Record<string, string>> = {
  pl: {
    who: 'Kontakt', where: 'Adres', when: 'Termin', send: 'Wysyłka',
    next: 'Dalej', back: 'Wstecz', stepsLabel: 'Kroki zgłoszenia',
    timeLabel: 'Okno przyjazdu', noSlots: 'Na dziś nie ma już wolnych okien — wybierz kolejny dzień.',
    photo: 'Zdjęcia', photoTitle: 'Zdjęcia tego, co jest do zrobienia',
    photoLead: 'Te prace wyceniamy po zdjęciu. Zrób 1–6 zdjęć z bliska i z daleka — fachowiec poda dokładną cenę przed przyjazdem albo na miejscu.',
    photoAdd: 'Dodaj zdjęcie', photoRemove: 'Usuń zdjęcie', photoNeed: 'Dodaj przynajmniej jedno zdjęcie — bez niego nie wycenimy tej pracy.',
    photoFail: 'Zdjęcie się nie wysłało. Spróbuj jeszcze raz.', photoFormat: 'Tego formatu przeglądarka nie otworzy. Zrób zrzut ekranu albo wybierz JPG/PNG.',
  },
  uk: {
    who: 'Контакти', where: 'Адреса', when: 'Час', send: 'Відправка',
    next: 'Далі', back: 'Назад', stepsLabel: 'Кроки заявки',
    timeLabel: 'Вікно приїзду', noSlots: 'На сьогодні вільних вікон немає — оберіть інший день.',
    photo: 'Фото', photoTitle: 'Фото того, що треба зробити',
    photoLead: 'Ці роботи оцінюємо за фото. Зробіть 1–6 фото зблизька і здалеку — майстер назве точну ціну до приїзду або на місці.',
    photoAdd: 'Додати фото', photoRemove: 'Прибрати фото', photoNeed: 'Додайте хоча б одне фото — без нього ми не оцінимо цю роботу.',
    photoFail: 'Фото не надіслалося. Спробуйте ще раз.', photoFormat: 'Цей формат браузер не відкриє. Зробіть скріншот або оберіть JPG/PNG.',
  },
  ru: {
    who: 'Контакты', where: 'Адрес', when: 'Время', send: 'Отправка',
    next: 'Далее', back: 'Назад', stepsLabel: 'Шаги заявки',
    timeLabel: 'Окно приезда', noSlots: 'На сегодня свободных окон нет — выберите другой день.',
    photo: 'Фото', photoTitle: 'Фото того, что нужно сделать',
    photoLead: 'Эти работы оцениваем по фото. Сделайте 1–6 фото вблизи и издалека — мастер назовёт точную цену до приезда или на месте.',
    photoAdd: 'Добавить фото', photoRemove: 'Убрать фото', photoNeed: 'Добавьте хотя бы одно фото — без него мы не оценим эту работу.',
    photoFail: 'Фото не отправилось. Попробуйте ещё раз.', photoFormat: 'Этот формат браузер не откроет. Сделайте скриншот или выберите JPG/PNG.',
  },
  en: {
    who: 'Contact', where: 'Address', when: 'Time', send: 'Send',
    next: 'Next', back: 'Back', stepsLabel: 'Request steps',
    timeLabel: 'Arrival window', noSlots: 'No windows left today — pick another day.',
    photo: 'Photos', photoTitle: 'Photos of what needs doing',
    photoLead: 'These jobs are priced from a photo. Take 1–6 photos, close up and from a distance — the specialist gives the exact price before the visit or on site.',
    photoAdd: 'Add a photo', photoRemove: 'Remove photo', photoNeed: 'Add at least one photo — we cannot price this job without it.',
    photoFail: 'The photo did not upload. Please try again.', photoFormat: 'Your browser cannot open this format. Take a screenshot or pick a JPG/PNG.',
  },
}

/** Дата человеку: «13.09.2026», а не ISO из поля ввода. */
const showDate = (iso: string, locale: string) => {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** Подсказка, когда запрос не ушёл из браузера вовсе. */
const blockedHint = (l: string) =>
  l === 'pl' ? 'Wygląda na to, że wysyłkę blokuje VPN albo blokada reklam — wyłącz je i spróbuj ponownie.'
  : l === 'uk' ? 'Схоже, надсилання блокує VPN або блокувальник реклами — вимкніть їх і спробуйте ще раз.'
  : l === 'ru' ? 'Похоже, отправку блокирует VPN или блокировщик рекламы — отключите их и попробуйте снова.'
  : 'It looks like a VPN or ad blocker is blocking the request — turn it off and try again.'

const privacyWord = (l: string) =>
  l === 'pl' ? 'politykę prywatności' : l === 'uk' ? 'політику конфіденційності'
  : l === 'ru' ? 'политику конфиденциальности' : 'privacy policy'
