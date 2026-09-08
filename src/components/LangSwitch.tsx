import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LOCALES, type Locale, type PageRec } from '../lib/types'
import { savePref } from '../lib/locale-pref'

const OUT_MS = 240

/**
 * Переключатель языка с анимацией:
 *  — скользящий «ползунок» под активным языком (замеряем положение ссылки);
 *  — при выборе страница мягко уходит (атрибут на <html>), потом переход,
 *    а Layout проигрывает появление. При reduced-motion — сразу переход.
 */
export default function LangSwitch({ page, locale, label, big = false, onPick }: {
  page: PageRec; locale: Locale; label: string; big?: boolean; onPick?: () => void
}) {
  const nav = useNavigate()
  const box = useRef<HTMLElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  const langs = LOCALES.filter((l) => page.paths[l])

  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('a[aria-current="true"]')
    if (!el || !box.current) return
    const b = box.current.getBoundingClientRect(), r = el.getBoundingClientRect()
    setThumb({ x: r.left - b.left, w: r.width })
  }, [locale, page.key])

  const pick = (e: React.MouseEvent, to: string, l: Locale) => {
    if (l === locale) { e.preventDefault(); return }
    if (e.metaKey || e.ctrlKey || e.button !== 0) return
    e.preventDefault()
    savePref(l)              // явный выбор запоминаем — он главнее языка устройства
    onPick?.()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { nav(to); return }
    document.documentElement.setAttribute('data-langswitch', 'out')
    window.setTimeout(() => nav(to), OUT_MS)
  }

  return (
    <nav className={`lang${big ? ' lang--big' : ''}`} aria-label={label} ref={box as never}>
      {thumb && <span className="lang__thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden="true" />}
      {langs.map((l) => (
        <Link
          key={l} to={page.paths[l]} hrefLang={l}
          aria-current={l === locale ? 'true' : undefined}
          onClick={(e) => pick(e, page.paths[l], l)}
        >
          {big ? l.toUpperCase() : l}
        </Link>
      ))}
    </nav>
  )
}
