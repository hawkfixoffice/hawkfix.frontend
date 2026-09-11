import { useState } from 'react'
import { useT } from '../lib/i18n'

export interface RangeState {
  from: string; to: string; mode: string
  set: (key: string, from?: string, to?: string) => void
}

const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** Период для аналитики: быстрые кнопки и произвольные даты.
 *  Держим ISO-границы, а не «сколько дней назад»: так один и тот же
 *  период можно передать в любой запрос и получить те же числа. */
export function useRange(): RangeState {
  const now = new Date()
  const [mode, setMode] = useState('month')
  const [from, setFrom] = useState(new Date(now.getTime() - 29 * 864e5).toISOString())
  const [to, setTo] = useState(new Date(now.getTime() + 864e5).toISOString())

  const set = (k: string, f?: string, t?: string) => {
    setMode(k)
    const today = startOf(new Date())
    const end = new Date(today.getTime() + 864e5)
    if (k === 'custom' && f && t) {
      setFrom(new Date(f).toISOString())
      setTo(new Date(new Date(t).getTime() + 864e5).toISOString())
      return
    }
    const days = k === 'today' ? 1 : k === 'week' ? 7 : k === 'month' ? 30 : k === 'quarter' ? 90 : 365
    setFrom(new Date(end.getTime() - days * 864e5).toISOString())
    setTo(end.toISOString())
  }

  return { from, to, mode, set }
}

// `key` — служебное имя в React, поэтому поле называется mode:
// иначе оно попадает в JSX как ключ и ломает список
export default function Range({ mode: active, set }: RangeState) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  return (
    <div className="split">
      <div className="chips">
        {['today', 'week', 'month', 'quarter', 'year'].map((k) => (
          <button key={k} className="chip" data-on={active === k || undefined} onClick={() => set(k)}>
            {t(`range.${k}`)}
          </button>
        ))}
        <button className="chip" data-on={active === 'custom' || undefined} onClick={() => setOpen((v) => !v)}>
          {t('range.custom')}
        </button>
      </div>

      {open && (
        <div className="split">
          <input type="date" value={a} onChange={(e) => setA(e.target.value)} className="dateinput" />
          <input type="date" value={b} onChange={(e) => setB(e.target.value)} className="dateinput" />
          <button className="btn btn--dark btn--sm" disabled={!a || !b}
                  onClick={() => { set('custom', a, b); setOpen(false) }}>
            {t('common.save')}
          </button>
        </div>
      )}
    </div>
  )
}
