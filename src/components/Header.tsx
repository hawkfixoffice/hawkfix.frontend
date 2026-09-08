import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT } from '../lib/ui'
import { KEY_PAGES, pathOf } from '../data/content'
import { usePage } from './PageContext'
import Icon from './Icon'
import LangSwitch from './LangSwitch'
import BrandMark from './BrandMark'

export default function Header() {
  const { page, locale, t } = usePage()
  const [open, setOpen] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [floating, setFloating] = useState(false)
  const hdr = useRef<HTMLElement>(null)

  // «Плавающей» шапка становится, когда герой (или шапка страницы) ушёл вверх:
  // подложка-полоса тает, вместо неё проявляется матовая капсула. Только на
  // десктопе — см. CSS.
  //
  // Границу героя меряем один раз (и на resize), а в кадре прокрутки только
  // читаем scrollY и пишем --fl. Замер в каждом кадре заставлял браузер
  // пересчитывать раскладку между чтением и записью — отсюда и была рваность.
  useEffect(() => {
    const el = hdr.current
    let raf = 0
    let anchorBottom = 240

    const measure = () => {
      const a = document.querySelector('.herox, .pagehead') as HTMLElement | null
      anchorBottom = a ? a.getBoundingClientRect().bottom + window.scrollY : 240
    }
    const apply = () => {
      raf = 0
      const y = window.scrollY
      // Степень «капсульности» 0…1 растёт на первых 220px после героя
      const progress = Math.min(1, Math.max(0, (y + 24 - anchorBottom) / 220))
      el?.style.setProperty('--fl', progress.toFixed(3))
      setStuck(y > 8)
      setFloating(progress > 0)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply) }
    const onResize = () => { measure(); onScroll() }

    measure()
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    // Пока грузятся картинки героя, его высота ещё меняется
    const t = window.setTimeout(onResize, 600)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(t)
      cancelAnimationFrame(raf)
    }
  }, [page.key])

  // Меню закрывается по Esc и блокирует прокрутку под собой
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open])

  const nav = [
    { to: pathOf(KEY_PAGES.services, locale), label: t.nav.services },
    { to: pathOf(KEY_PAGES.prices, locale), label: t.nav.prices },
    { to: pathOf(KEY_PAGES.about, locale), label: t.nav.about },
    { to: pathOf(KEY_PAGES.contact, locale), label: t.nav.contact },
  ]
  const here = page.paths[locale]

  return (
    <>
      <header className="hdr" data-stuck={stuck} data-float={floating} ref={hdr}>
        <div className="wrap hdr__in">
          <Link className="brand" to={pathOf(KEY_PAGES.home, locale)}>
            <BrandMark />
          </Link>

          <nav className="nav" aria-label={t.a11y.menu}>
            {nav.map((n) => (
              <Link key={n.to} to={n.to} aria-current={here === n.to ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>

          <div className="hdr__spacer" />

          <div className="hdr__side">
            <LangSwitch page={page} locale={locale} label={t.a11y.lang} />
            <a className="tel" href={CONTACT.phoneHref}>
              <Icon name="phone" size={16} />
              <span>{CONTACT.phone}</span>
            </a>
            <button
              className="burger" type="button" aria-expanded={open}
              aria-controls="mobile-menu" aria-label={open ? t.a11y.close : t.a11y.menu}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
            </button>
          </div>
        </div>
      </header>

      {/* Меню рендерится СНАРУЖИ <header>: у шапки backdrop-filter, а он создаёт
          содержащий блок для position: fixed — внутри меню не растянулось бы
          на весь экран. */}
      {open && (
        <div className="mobmenu" id="mobile-menu" role="dialog" aria-modal="true" aria-label={t.a11y.menu}>
          <div className="mobmenu__bar">
            <Link className="brand brand--onDark" to={pathOf(KEY_PAGES.home, locale)} onClick={() => setOpen(false)}>
              <BrandMark />
            </Link>
            <button className="mobmenu__close" type="button" onClick={() => setOpen(false)} aria-label={t.a11y.close}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <nav className="mobmenu__nav" aria-label={t.a11y.menu}>
            {nav.map((n, i) => (
              <Link
                key={n.to} to={n.to} onClick={() => setOpen(false)}
                style={{ ['--i' as string]: String(i) }}
              >
                <span>{n.label}</span>
                <Icon name="arrowUpRight" size={26} />
              </Link>
            ))}
          </nav>

          <div className="mobmenu__foot">
            <a className="btn btn--primary" href={CONTACT.phoneHref}>
              <Icon name="phone" size={17} /> {CONTACT.phone}
            </a>
            <a className="btn btn--onDark" href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">
              <Icon name="whatsapp" size={17} /> {t.cta.whatsapp}
            </a>
            <LangSwitch page={page} locale={locale} label={t.a11y.lang} big onPick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
