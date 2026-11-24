import { useMemo } from 'react'
import type { Quote } from '../../lib/quote'
import { formatMoney } from '../../lib/quote'
import { settings } from '../../data/content'
import { fromWord, nameOf } from '../../lib/price'
import { CONTACT } from '../../lib/ui'
import { draftCode, draftText, postDraft, waHref } from '../../lib/wa'
import { usePage } from '../PageContext'

/** «Napisz na WhatsApp» со сметой и кодом заявки.
 *
 *  Это настоящая ссылка, готовая до нажатия: на iPhone WhatsApp открывается
 *  только по прямому касанию ссылки, а не после ответа сервера. Черновик
 *  уходит в базу фоном в момент нажатия, офис находит его в панели по коду.
 *
 *  Пустая смета и пустое описание: если задан `onEmpty`, вместо ссылки —
 *  кнопка, которая просит написать, что случилось (иначе в чат ушло бы
 *  пустое сообщение без кода, а лид — мимо панели); без `onEmpty` —
 *  обычная ссылка, её перехватит общий обработчик и откроет попап. */
export default function WaDraft({ quote, urgent, comment = '', className, label, children, onEmpty, onSent }: {
  quote: Quote; urgent: boolean; comment?: string; className?: string
  /** Подпись для скринридера, если внутри только иконка */
  label?: string
  children: React.ReactNode
  onEmpty?: () => void
  onSent?: (code: string) => void
}) {
  const { locale } = usePage()
  const lines = quote.lines.map((l) => `• ${nameOf(l.item, locale)} ×${l.qty}`)
  const total = quote.lines.length
    ? `${quote.hasScope ? `${fromWord(locale)} ` : ''}${formatMoney(quote.total, settings, locale)}`
    : ''
  const text = comment.trim()
  const empty = !lines.length && !text
  // Та же смета с тем же описанием — тот же код: повторное нажатие не плодит
  // черновики. Описание в подписи обязательно: иначе две разные проблемы без
  // работ из прайса получали один код, и вторая терялась как «повтор»
  const sig = JSON.stringify([quote.lines.map((l) => [l.item.key, l.qty]).sort(), urgent, text])
  // Код считается при рендере, а не в эффекте: иначе сразу после правки
  // ссылка ещё несла прежний код, а черновик в базу уходил с новым.
  // На сервере смета всегда пуста, так что sessionStorage здесь не трогается.
  const code = useMemo(() => (empty || typeof window === 'undefined' ? '' : draftCode(sig)), [sig, empty])

  if (empty && onEmpty) {
    return <button type="button" className={className} aria-label={label} onClick={onEmpty}>{children}</button>
  }

  const ready = !empty && code
  const href = ready ? waHref(draftText(locale, code, lines, total, text, quote.hasScope)) : CONTACT.whatsappHref

  return (
    <a
      className={className} href={href} target="_blank" rel="noopener"
      aria-label={label} data-wa={ready ? 'draft' : undefined}
      onClick={() => {
        if (!ready) return
        postDraft({
          code, locale, urgent, comment: text,
          items: quote.lines.map((l) => ({
            key: l.item.key, name: nameOf(l.item, locale), qty: l.qty, sum: l.sum,
            ...(l.item.ptype && l.item.ptype !== 'fixed' ? { ptype: l.item.ptype } : {}),
          })),
          totals: {
            labour: quote.labour, minimum: quote.minimum, urgentFee: quote.urgentFee, total: quote.total, hours: quote.hours,
            ...(quote.hasScope ? { approx: true } : {}),
          },
        })
        onSent?.(code)
      }}
    >
      {children}
    </a>
  )
}
