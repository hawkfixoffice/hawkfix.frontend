import { Link } from 'react-router-dom'
import { CONTACT } from '../lib/ui'
import { KEY_PAGES, allPages, pathOf, services } from '../data/content'
import type { Locale } from '../lib/types'
import { usePage } from './PageContext'
import { U } from '../cms/E'
import { shortName } from '../lib/facts'

function titleOf(key: string, locale: Locale): string {
  return allPages.find((p) => p.key === key)?.tr[locale].h1 ?? key
}

/** Простой подвал: контакты крупно, все услуги ссылками, документы.
 *  Полный список услуг здесь — ещё и перелинковка: каждая страница
 *  услуги получает ссылку с каждой страницы сайта. */
export default function Footer() {
  const { locale, t } = usePage()
  const year = new Date().getFullYear()
  const nav = [
    { to: pathOf(KEY_PAGES.services, locale), label: t.nav.services },
    { to: pathOf(KEY_PAGES.prices, locale), label: t.nav.prices },
    { to: pathOf(KEY_PAGES.about, locale), label: t.nav.about },
    { to: pathOf(KEY_PAGES.contact, locale), label: t.nav.contact },
  ]

  return (
    <footer className="s-foot">
      <div className="wrap">
        <div className="s-foot__top">
          <div>
            <p className="s-foot__brand">HAWK.FIX</p>
            <U as="p" className="s-foot__tag" k="hero.kicker" />
          </div>
          <div className="s-foot__contact">
            <a className="s-foot__big num" href={CONTACT.whatsappHref} target="_blank" rel="noopener">{CONTACT.whatsappLabel}</a>
            <U as="p" className="s-foot__hours" k="simple.hours" />
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </div>
        </div>

        <nav className="s-foot__nav" aria-label={t.a11y.menu}>
          {nav.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
        </nav>

        <nav className="s-foot__svc" aria-label={t.footer.services}>
          {services.map((s) => (
            <Link key={s.key} to={s.paths[locale]}>{shortName(s.tr[locale].h1)}</Link>
          ))}
        </nav>

        <div className="s-foot__legal">
          <span>© {year} HAWK.FIX · {CONTACT.city} — <U k="footer.rights" /></span>
          <nav aria-label={t.footer.legal}>
            <Link to={pathOf(KEY_PAGES.privacy, locale)}>{titleOf(KEY_PAGES.privacy, locale)}</Link>
            <Link to={pathOf(KEY_PAGES.cookies, locale)}>{titleOf(KEY_PAGES.cookies, locale)}</Link>
            <Link to={pathOf(KEY_PAGES.terms, locale)}>{titleOf(KEY_PAGES.terms, locale)}</Link>
            <a href={CONTACT.facebook} target="_blank" rel="noopener">Facebook</a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
