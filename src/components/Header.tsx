import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LOCALES, type Locale } from '../lib/types'
import { CONTACT } from '../lib/ui'
import { KEY_PAGES, pathOf } from '../data/content'
import { usePage } from './PageContext'
import Icon from './Icon'

export default function Header() {
  const { page, locale, t } = usePage()
  const [open, setOpen] = useState(false)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
  const langs = LOCALES.filter((l) => page.paths[l])

  return (
    <>
      <header className="hdr" data-stuck={stuck}>
        <div className="wrap hdr__in">
          <Link className="brand" to={pathOf(KEY_PAGES.home, locale)}>
            HAWK<span className="brand__dot">.</span>FIX
          </Link>

          <nav className="nav" aria-label={t.a11y.menu}>
            {nav.map((n) => (
              <Link key={n.to} to={n.to} aria-current={here === n.to ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>

          <div className="hdr__spacer" />

          <div className="hdr__side">
            <nav className="lang" aria-label={t.a11y.lang}>
              {langs.map((l: Locale) => (
                <Link key={l} to={page.paths[l]} hrefLang={l} aria-current={l === locale ? 'true' : undefined}>
                  {l}
                </Link>
              ))}
            </nav>
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
              HAWK<span className="brand__dot">.</span>FIX
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
            <nav className="mobmenu__lang" aria-label={t.a11y.lang}>
              {langs.map((l: Locale) => (
                <Link
                  key={l} to={page.paths[l]} hrefLang={l}
                  aria-current={l === locale ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
