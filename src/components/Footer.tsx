import { Link } from 'react-router-dom'
import { CONTACT } from '../lib/ui'
import { KEY_PAGES, allPages, pathOf, services } from '../data/content'
import type { Locale } from '../lib/types'
import { usePage } from './PageContext'
import Icon from './Icon'

/** Заголовок страницы берём из её же контента — переводы не дублируем. */
function titleOf(key: string, locale: Locale): string {
  return allPages.find((p) => p.key === key)?.tr[locale].h1 ?? key
}

export default function Footer() {
  const { locale, t } = usePage()
  const year = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__cols">
          <div>
            <p className="footer__title">HAWK.FIX</p>
            <p className="footer__pitch">{t.home.ctaLead}</p>
            <div className="footer__contact">
              <a href={CONTACT.phoneHref}><Icon name="phone" size={16} /> {CONTACT.phone}</a>
              <a href={`mailto:${CONTACT.email}`}><Icon name="mail" size={16} /> {CONTACT.email}</a>
              <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">
                <Icon name="whatsapp" size={16} /> {t.cta.whatsapp}
              </a>
            </div>
          </div>

          <div>
            <p className="footer__title">{t.footer.services}</p>
            <ul className="footer__links">
              {services.slice(0, 6).map((s) => (
                <li key={s.key}><Link to={s.paths[locale]}>{s.tr[locale].h1}</Link></li>
              ))}
              <li><Link to={pathOf(KEY_PAGES.services, locale)}>{t.cta.allServices} →</Link></li>
            </ul>
          </div>

          <div>
            <p className="footer__title">{t.footer.company}</p>
            <ul className="footer__links">
              <li><Link to={pathOf(KEY_PAGES.about, locale)}>{t.nav.about}</Link></li>
              <li><Link to={pathOf(KEY_PAGES.prices, locale)}>{t.nav.prices}</Link></li>
              <li><Link to={pathOf(KEY_PAGES.contact, locale)}>{t.nav.contact}</Link></li>
              <li><a href={CONTACT.facebook} target="_blank" rel="noopener">Facebook</a></li>
            </ul>
          </div>

          <div>
            <p className="footer__title">{t.footer.legal}</p>
            <ul className="footer__links">
              <li><Link to={pathOf(KEY_PAGES.privacy, locale)}>{titleOf(KEY_PAGES.privacy, locale)}</Link></li>
              <li><Link to={pathOf(KEY_PAGES.cookies, locale)}>{titleOf(KEY_PAGES.cookies, locale)}</Link></li>
              <li><Link to={pathOf(KEY_PAGES.terms, locale)}>{titleOf(KEY_PAGES.terms, locale)}</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer__legal">
          <span>© {year} HAWK.FIX — {t.footer.rights}</span>
          <span>{CONTACT.city}, PL</span>
        </div>
      </div>

      <div className="footer__mark" aria-hidden="true">
        <p className="wordmark">HAWK<span className="wordmark__dot">.</span>FIX</p>
      </div>
    </footer>
  )
}
