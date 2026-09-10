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

/** Адрес edge-функции. Значение публичное по назначению, поэтому дефолт зашит:
 *  без него сборка, собранная без переменной окружения, отправляла заявку
 *  «в никуда» и форма молча показывала ошибку. */
const ENDPOINT = import.meta.env.VITE_LEAD_ENDPOINT
  || 'https://vpijumbbmwjibvlohfug.supabase.co/functions/v1/lead'

/** Окна приезда по два часа: точное время бригада подтверждает звонком,
 *  а выбирать из 12 получасовых слотов человеку тяжело. */
const SLOTS = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00', '18:00-20:00']

type State = 'idle' | 'sending' | 'ok' | 'error'
const STEPS = ['who', 'where', 'when', 'send'] as const
type Step = (typeof STEPS)[number]

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
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', comment: '', when: '', time: '' })

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

  const idx = STEPS.indexOf(step)
  // Куда идём — от этого зависит, с какой стороны въезжает новый шаг
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  // Карточка меняет высоту вместе с шагом: без этого «Далее» дёргало
  // всю смету, а на телефоне лист прижат к низу и прыгал сильнее всего
  const stage = useMorphHeight<HTMLDivElement>(`${step}:${state}`)

  const go = (to: Step) => {
    setDir(STEPS.indexOf(to) < idx ? 'back' : 'fwd')
    stage.capture()
    setStep(to)
  }

  function next() {
    if (step === 'who') {
      setTouched((v) => ({ ...v, name: true, phone: true }))
      if (nameBad || phoneBad) return
      saveProfile({ name: f.name, phone: f.phone, email: f.email, address: f.address })
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

    saveProfile({ name: f.name, phone: f.phone, email: f.email, address: f.address })
    setState('sending')
    setReceipt(null)
    setShowReceipt(true)

    const payload = {
      locale, urgent,
      contact: { name: f.name, phone: f.phone, email: f.email },
      place: { district: hit?.district ?? '', address: f.address },
      when: f.when,
      whenTime: f.time,
      comment: f.comment,
      items: quote.lines.map((l) => ({ key: l.item.key, name: l.item.name[locale], qty: l.qty, sum: l.sum })),
      totals: { labour: quote.labour, minimum: quote.minimum, urgentFee: quote.urgentFee, total: quote.total, hours: quote.hours },
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json().catch(() => ({}))
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
        total: formatMoney(quote.total, settings, locale),
        hours: String(quote.hours),
        urgent,
        lines: quote.lines.map((l) => ({
          name: l.item.name[locale], qty: l.qty, sum: formatMoney(l.sum, settings, locale),
        })),
      })
    } catch {
      setShowReceipt(false)
      setState('error')
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
            {f.when && <li><span>{t.form.when}</span><b className="num">{[showDate(f.when, locale), f.time.replace('-', ' – ')].filter(Boolean).join(' · ')}</b></li>}
          </ul>
        </div>
      )}
      </div>

      {state === 'error' && <p className="field__err" role="alert">{t.form.error}</p>}

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
                ? `${t.form.submit} · ${formatMoney(quote.total, settings, locale)}`
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
  },
  uk: {
    who: 'Контакти', where: 'Адреса', when: 'Час', send: 'Відправка',
    next: 'Далі', back: 'Назад', stepsLabel: 'Кроки заявки',
    timeLabel: 'Вікно приїзду', noSlots: 'На сьогодні вільних вікон немає — оберіть інший день.',
  },
  ru: {
    who: 'Контакты', where: 'Адрес', when: 'Время', send: 'Отправка',
    next: 'Далее', back: 'Назад', stepsLabel: 'Шаги заявки',
    timeLabel: 'Окно приезда', noSlots: 'На сегодня свободных окон нет — выберите другой день.',
  },
  en: {
    who: 'Contact', where: 'Address', when: 'Time', send: 'Send',
    next: 'Next', back: 'Back', stepsLabel: 'Request steps',
    timeLabel: 'Arrival window', noSlots: 'No windows left today — pick another day.',
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

const privacyWord = (l: string) =>
  l === 'pl' ? 'politykę prywatności' : l === 'uk' ? 'політику конфіденційності'
  : l === 'ru' ? 'политику конфиденциальности' : 'privacy policy'
