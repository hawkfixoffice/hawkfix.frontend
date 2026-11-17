import { useEffect, useState } from 'react'
import type { Quote } from '../../lib/quote'
import { formatMoney } from '../../lib/quote'
import { settings } from '../../data/content'
import { fromWord, nameOf } from '../../lib/price'
import { CONTACT } from '../../lib/ui'
import { draftCode, draftText, postDraft, waHref } from '../../lib/wa'
import { usePage } from '../PageContext'

/** «Wyślij na WhatsApp» со сметой и кодом заявки.
 *
 *  Это настоящая ссылка, готовая до нажатия: на iPhone WhatsApp открывается
 *  только по прямому касанию ссылки, а не после ответа сервера. Черновик
 *  уходит в базу фоном в момент нажатия, офис находит его по коду.
 *  Пустая смета и пустое описание — обычная ссылка, текст подставит
 *  общий обработчик (`installWaLinks`). */
export default function WaDraft({ quote, urgent, comment = '', className, label, children }: {
  quote: Quote; urgent: boolean; comment?: string; className?: string
  /** Подпись для скринридера, если внутри только иконка */
  label?: string
  children: React.ReactNode
}) {
  const { locale } = usePage()
  const lines = quote.lines.map((l) => `• ${nameOf(l.item, locale)} ×${l.qty}`)
  const total = quote.lines.length
    ? `${quote.hasScope ? `${fromWord(locale)} ` : ''}${formatMoney(quote.total, settings, locale)}`
    : ''
  const empty = !lines.length && !comment.trim()
  // Та же смета — тот же код: повторное нажатие не плодит черновики
  const sig = JSON.stringify([quote.lines.map((l) => [l.item.key, l.qty]).sort(), urgent])
  const [code, setCode] = useState('')
  useEffect(() => { if (!empty) setCode(draftCode(sig)) }, [sig, empty])

  const ready = !empty && code
  const href = ready ? waHref(draftText(locale, code, lines, total, comment)) : CONTACT.whatsappHref

  return (
    <a
      className={className} href={href} target="_blank" rel="noopener"
      aria-label={label} data-wa={ready ? 'draft' : undefined}
      onClick={() => {
        if (!ready) return
        postDraft({
          code, locale, urgent, comment: comment.trim(),
          items: quote.lines.map((l) => ({
            key: l.item.key, name: nameOf(l.item, locale), qty: l.qty, sum: l.sum,
            ...(l.item.ptype && l.item.ptype !== 'fixed' ? { ptype: l.item.ptype } : {}),
          })),
          totals: {
            labour: quote.labour, minimum: quote.minimum, urgentFee: quote.urgentFee, total: quote.total, hours: quote.hours,
            ...(quote.hasScope ? { approx: true } : {}),
          },
        })
      }}
    >
      {children}
    </a>
  )
}
