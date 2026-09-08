import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Quote } from '../../lib/quote'
import { formatMoney } from '../../lib/quote'
import { settings, KEY_PAGES, pathOf } from '../../data/content'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import Lottie from '../Lottie'

const DISTRICTS = [
  'Śródmieście', 'Mokotów', 'Wola', 'Żoliborz', 'Ochota', 'Praga-Południe', 'Praga-Północ',
  'Bielany', 'Ursynów', 'Bemowo', 'Targówek', 'Białołęka', 'Wawer', 'Wilanów', 'Włochy',
  'Ursus', 'Rembertów', 'Wesoła', 'Wawer',
]

const ENDPOINT = import.meta.env.VITE_LEAD_ENDPOINT ?? ''

type State = 'idle' | 'sending' | 'ok' | 'error'

/** Форма заявки. Валидация — на blur, а не только на отправке;
 *  состояние отправки видно всегда (загрузка → успех/ошибка). */
export default function LeadForm({ quote, urgent, onSent }: { quote: Quote; urgent: boolean; onSent: () => void }) {
  const { locale, t } = usePage()
  const [state, setState] = useState<State>('idle')
  const [orderNo, setOrderNo] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [f, setF] = useState({ name: '', phone: '', email: '', district: '', address: '', comment: '', when: '' })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }))
  const blur = (k: string) => () => setTouched((v) => ({ ...v, [k]: true }))

  const errName = touched.name && !f.name.trim()
  const errPhone = touched.phone && f.phone.replace(/\D/g, '').length < 9
  // Почта необязательна, но если введена — должна быть похожа на адрес
  const errEmail = touched.email && f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())
  const empty = quote.lines.length === 0 && !f.comment.trim()

  // Выходные форма не принимает — бригады работают пн–пт
  const today = new Date()
  const minDate = today.toISOString().slice(0, 10)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ name: true, phone: true })
    if (!f.name.trim() || f.phone.replace(/\D/g, '').length < 9 || empty) return
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) {
      setTouched((v) => ({ ...v, email: true })); return
    }

    setState('sending')
    const payload = {
      locale, urgent,
      contact: { name: f.name, phone: f.phone, email: f.email },
      place: { district: f.district, address: f.address },
      when: f.when,
      comment: f.comment,
      items: quote.lines.map((l) => ({ key: l.item.key, name: l.item.name[locale], qty: l.qty, sum: l.sum })),
      totals: { labour: quote.labour, minimum: quote.minimum, urgentFee: quote.urgentFee, total: quote.total, hours: quote.hours },
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    }

    try {
      if (!ENDPOINT) throw new Error('endpoint not configured')
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json().catch(() => ({}))
      setOrderNo(data?.orderNo ?? '')
      setState('ok')
      onSent()
    } catch {
      setState('error')
    }
  }

  if (state === 'ok') {
    return (
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
    )
  }

  return (
    <form className="lead" onSubmit={submit} noValidate>
      <div className="lead__grid">
        <div className="field">
          <label htmlFor="lf-name">{t.form.name} *</label>
          <input
            id="lf-name" name="name" value={f.name} onChange={set('name')} onBlur={blur('name')}
            autoComplete="given-name" aria-invalid={errName || undefined}
            aria-describedby={errName ? 'lf-name-err' : undefined}
          />
          {errName && <p className="field__err" id="lf-name-err">{t.form.required}</p>}
        </div>

        <div className="field">
          <label htmlFor="lf-phone">{t.form.phone} *</label>
          <input
            id="lf-phone" name="phone" type="tel" inputMode="tel" value={f.phone}
            onChange={set('phone')} onBlur={blur('phone')} autoComplete="tel"
            placeholder="+48 …" aria-invalid={errPhone || undefined}
            aria-describedby={errPhone ? 'lf-phone-err' : undefined}
          />
          {errPhone && <p className="field__err" id="lf-phone-err">{t.form.required}</p>}
        </div>

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
          {errEmail && <p className="field__err" id="lf-email-err">{t.form.emailBad}</p>}
        </div>

        <div className="field">
          <label htmlFor="lf-district">{t.form.district}</label>
          <select id="lf-district" name="district" value={f.district} onChange={set('district')}>
            <option value="">—</option>
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="lf-when">{t.form.when}</label>
          <input id="lf-when" name="when" type="date" min={minDate} value={f.when} onChange={set('when')} />
        </div>

        <div className="field field--wide">
          <label htmlFor="lf-comment">{t.form.comment}</label>
          <textarea id="lf-comment" name="comment" rows={3} value={f.comment} onChange={set('comment')} />
        </div>
      </div>

      {state === 'error' && <p className="field__err" role="alert">{t.form.error}</p>}

      <button className="btn btn--primary lead__submit" type="submit" disabled={state === 'sending'}>
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

      <p className="lead__consent">
        {t.form.agree}{' '}
        <Link to={pathOf(KEY_PAGES.privacy, locale)}>{privacyWord(locale)}</Link>.
      </p>
    </form>
  )
}

const privacyWord = (l: string) =>
  l === 'pl' ? 'politykę prywatności' : l === 'uk' ? 'політику конфіденційності'
  : l === 'ru' ? 'политику конфиденциальности' : 'privacy policy'
