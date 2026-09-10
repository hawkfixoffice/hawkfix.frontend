import { useEffect, useMemo, useRef, useState } from 'react'
import { usePage } from '../PageContext'
import Icon from '../Icon'

export interface ReceiptData {
  orderNo: string
  name: string
  phone: string
  address: string
  when: string
  time: string
  total: string
  hours: string
  urgent: boolean
  lines: { name: string; qty: number; sum: string }[]
}

type Phase = 'print' | 'hold' | 'fly'

/** Полноэкранная «печать чека»: страница за ним темнеет и уходит в размытие,
 *  из принтера выезжает лента с данными заявки, потом улетает вверх.
 *
 *  Показ начинается сразу по нажатию «отправить» (`data === null` — принтер
 *  ещё греется), а лента выезжает, когда пришёл номер заявки: иначе на чеке
 *  печатать нечего, а ждать с пустым экраном — хуже, чем видеть процесс. */
export default function Receipt({ data, onDone }: { data: ReceiptData | null; onDone: () => void }) {
  const { locale } = usePage()
  const T = TEXT[locale] ?? TEXT.pl
  const [phase, setPhase] = useState<Phase>('print')
  const done = useRef(false)

  const reduced = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches

  const finish = () => { if (!done.current) { done.current = true; onDone() } }

  // Лента выехала → пауза, чтобы чек можно было прочитать → улетает
  useEffect(() => {
    if (!data) return
    if (reduced) {
      const t = setTimeout(finish, 2200)
      return () => clearTimeout(t)
    }
    const t1 = setTimeout(() => setPhase('hold'), PRINT_MS)
    const t2 = setTimeout(() => setPhase('fly'), PRINT_MS + HOLD_MS)
    const t3 = setTimeout(finish, PRINT_MS + HOLD_MS + FLY_MS)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [data, reduced])

  // Ждать до конца необязательно: Esc или клик по фону закрывают сразу
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && data) finish() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [data])

  // Полосы штрихкода детерминированы номером заявки: одна и та же заявка
  // всегда рисуется одинаково, но чеки разных заявок отличаются.
  const bars = useMemo(() => barsFor(data?.orderNo ?? ''), [data?.orderNo])

  return (
    <div
      className="rcp" data-phase={data ? phase : 'wait'} data-reduced={reduced || undefined}
      role="status" aria-live="polite"
      onClick={() => data && finish()}
    >
      <div className="rcp__stage">
        <div className="rcp__printer" aria-hidden="true">
          <span className="rcp__led" />
          <span className="rcp__slot" />
        </div>

        <div className="rcp__paperwrap">
          <div className="rcp__paper">
            {data ? (
              <div className="rcp__inner">
                <p className="rcp__brand">HAWK<span>.</span>FIX</p>
                <p className="rcp__thanks">{T.thanks}</p>
                <p className="rcp__sub">{T.sub}</p>

                <div className="rcp__tear" aria-hidden="true" />

                <dl className="rcp__rows">
                  <div><dt>{T.order}</dt><dd className="num">{data.orderNo || '—'}</dd></div>
                  <div><dt>{T.amount}</dt><dd className="num rcp__amount">{data.total}</dd></div>
                  {(data.when || data.time) && (
                    <div>
                      <dt>{T.when}</dt>
                      <dd className="num">
                        {data.when}
                        {data.time && <small className="rcp__slotline">{data.time}</small>}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>{T.status}</dt>
                    <dd><span className="rcp__badge">{data.urgent ? T.urgent : T.confirmed}</span></dd>
                  </div>
                </dl>

                {data.lines.length > 0 && (
                  <ul className="rcp__lines">
                    {data.lines.slice(0, 4).map((l) => (
                      <li key={l.name}>
                        <span>{l.name}</span>
                        <span className="num">×{l.qty}</span>
                        <span className="num">{l.sum}</span>
                      </li>
                    ))}
                    {data.lines.length > 4 && <li className="rcp__more">+{data.lines.length - 4}</li>}
                  </ul>
                )}

                <div className="rcp__client">
                  <span className="rcp__avatar"><Icon name="check" size={16} /></span>
                  <span className="rcp__clientText">
                    <b>{data.name}</b>
                    <small>{data.address || data.phone}</small>
                  </span>
                </div>

                <div className="rcp__code" aria-hidden="true">
                  {bars.map((w, i) => <span key={i} style={{ width: `${w}px` }} />)}
                </div>
                <p className="rcp__codeNo num" aria-hidden="true">{data.orderNo}</p>
              </div>
            ) : (
              <div className="rcp__inner rcp__inner--wait">
                <p className="rcp__brand">HAWK<span>.</span>FIX</p>
                <p className="rcp__sub">{T.printing}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const PRINT_MS = 1700
const HOLD_MS = 1900
const FLY_MS = 900

/** Ширины полос штрихкода из строки номера — без случайности,
 *  иначе перерисовка React меняла бы код на глазах. */
function barsFor(seed: string): number[] {
  const s = seed || 'HAWKFIX'
  const out: number[] = []
  for (let i = 0; i < 46; i++) {
    const c = s.charCodeAt(i % s.length) + i * 7
    out.push(1 + (c % 4))
  }
  return out
}

const TEXT: Record<string, Record<string, string>> = {
  pl: {
    thanks: 'Dziękujemy!', sub: 'Zgłoszenie przyjęte', printing: 'Drukujemy potwierdzenie…',
    order: 'Numer zgłoszenia', amount: 'Kwota', when: 'Termin', status: 'Status',
    confirmed: 'Przyjęte', urgent: 'Pilne',
  },
  uk: {
    thanks: 'Дякуємо!', sub: 'Заявку прийнято', printing: 'Друкуємо підтвердження…',
    order: 'Номер заявки', amount: 'Сума', when: 'Час', status: 'Статус',
    confirmed: 'Прийнято', urgent: 'Терміново',
  },
  ru: {
    thanks: 'Спасибо!', sub: 'Заявка принята', printing: 'Печатаем подтверждение…',
    order: 'Номер заявки', amount: 'Сумма', when: 'Время', status: 'Статус',
    confirmed: 'Принято', urgent: 'Срочно',
  },
  en: {
    thanks: 'Thank you!', sub: 'Request received', printing: 'Printing your receipt…',
    order: 'Request no.', amount: 'Amount', when: 'Slot', status: 'Status',
    confirmed: 'Confirmed', urgent: 'Urgent',
  },
}
