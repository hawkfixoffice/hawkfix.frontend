import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WA_OPEN, quoteSelection } from '../../lib/wa'
import type { Selection } from '../../lib/quote'
import { usePage } from '../PageContext'
import Icon from '../Icon'
import WaComposer from './WaComposer'

/** Попап «Napisz na WhatsApp»: открывается любой кнопкой WhatsApp вне героя
 *  главной (шапка, подвал, контакты, страницы услуг). Внутри — та же форма,
 *  что в герое; если в калькуляторе уже выбраны работы, начинает с них. */
export default function WaModal() {
  const { t, locale } = usePage()
  const [open, setOpen] = useState(0)
  const [initial, setInitial] = useState<Selection[]>([])
  const back = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const on = () => {
      back.current = document.activeElement as HTMLElement | null
      setInitial(quoteSelection())
      setOpen((n) => n + 1)
    }
    window.addEventListener(WA_OPEN, on)
    return () => window.removeEventListener(WA_OPEN, on)
  }, [])

  const close = () => setOpen(0)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      back.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="wamodal" role="presentation">
      <button type="button" className="wamodal__back" aria-label={t.a11y.close} onClick={close} tabIndex={-1} />
      <div className="wamodal__card" role="dialog" aria-modal="true" aria-labelledby="wamodal-h">
        <div className="wamodal__head">
          <p className="wamodal__h" id="wamodal-h"><Icon name="whatsapp" size={20} /> {HEAD[locale] ?? HEAD.pl}</p>
          <button type="button" className="wamodal__x" onClick={close} aria-label={t.a11y.close}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {/* key: каждое открытие — чистая форма с текущими работами калькулятора */}
        <WaComposer key={open} variant="modal" initial={initial} autoFocus />
      </div>
    </div>,
    document.body,
  )
}

const HEAD: Record<string, string> = {
  pl: 'Napisz do nas na WhatsApp',
  uk: 'Напишіть нам у WhatsApp',
  ru: 'Напишите нам в WhatsApp',
  en: 'Message us on WhatsApp',
}
