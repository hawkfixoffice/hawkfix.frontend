import { Link } from 'react-router-dom'
import { CONTACT } from '../lib/ui'
import { KEY_PAGES, allPages, pathOf, services } from '../data/content'
import type { Locale } from '../lib/types'
import { usePage } from './PageContext'
import Icon from './Icon'

function titleOf(key: string, locale: Locale): string {
  return allPages.find((p) => p.key === key)?.tr[locale].h1 ?? key
}

/** Подвал по последнему слайду: тёмный контейнер с крупным заголовком слева,
 *  контактами справа и кнопкой-кольцом «наверх» на верхней кромке. */
export default function Footer() {
  const { locale, t } = usePage()
  const year = new Date().getFullYear()
  const toTop = (e: React.MouseEvent) => {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__box">
          <a className="ring-btn footer__up" href="#main" onClick={toTop} aria-label={t.a11y.skip}>
            <Icon name="arrowUp" size={26} />
          </a>

          <div className="footer__lead">
            <span className="pill pill--outline">HAWK.FIX · {CONTACT.city}</span>
            <h2 className="footer__h">{t.home.ctaHead}</h2>
            <p className="footer__sub">{t.home.ctaLead}</p>
            <div className="footer__actions">
              <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                {t.cta.quote} <Icon name="arrow" size={17} />
              </Link>
              <a className="btn btn--outline" href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">
                <Icon name="whatsapp" size={17} /> {t.cta.whatsapp}
              </a>
            </div>
          </div>

          <div className="footer__contact">
            <h3 className="footer__contactTitle">{t.nav.contact}</h3>
            <div className="footer__rows">
              <p className="footer__row">
                <small>{t.form.phone}</small>
                <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
              </p>
              <p className="footer__row">
                <small>E-mail</small>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </p>
              <p className="footer__row">
                <small>{t.cta.whatsapp}</small>
                <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">+{CONTACT.whatsapp}</a>
              </p>
              <nav className="footer__links" aria-label={t.footer.services}>
                {services.slice(0, 5).map((s) => (
                  <Link key={s.key} to={s.paths[locale]}>{s.tr[locale].h1}</Link>
                ))}
                <Link to={pathOf(KEY_PAGES.services, locale)}>{t.cta.allServices} →</Link>
              </nav>
            </div>
          </div>

          <div className="footer__legal">
            <span>© {year} HAWK.FIX — {t.footer.rights}</span>
            <nav className="footer__links" aria-label={t.footer.legal} style={{ marginTop: 0 }}>
              <Link to={pathOf(KEY_PAGES.privacy, locale)}>{titleOf(KEY_PAGES.privacy, locale)}</Link>
              <Link to={pathOf(KEY_PAGES.cookies, locale)}>{titleOf(KEY_PAGES.cookies, locale)}</Link>
              <Link to={pathOf(KEY_PAGES.terms, locale)}>{titleOf(KEY_PAGES.terms, locale)}</Link>
              <a href={CONTACT.facebook} target="_blank" rel="noopener">Facebook</a>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
