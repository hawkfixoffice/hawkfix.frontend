import { Link } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import { faq } from '../data/faq'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Accordion from '../components/Accordion'
import Calculator from '../components/calc/Calculator'
import Facts from '../components/Facts'
import { CtaBand, MainActions, ServiceRows } from '../components/Simple'
import E, { U } from '../cms/E'
import { CONTACT } from '../lib/ui'

/** Главная в простой вёрстке (2026-09-29): крупный текст, много воздуха,
 *  ни одного декоративного элемента. Калькулятор — без изменений. */
export default function Home() {
  const { locale, t } = usePage()
  const f = faq[locale]
  const cur = settings.currency

  return (
    <>
      {/* ================================ ГЕРОЙ ================================ */}
      <section className="s-hero">
        <div className="wrap s-hero__grid">
          <div className="s-hero__text">
            <U as="p" className="s-kicker" k="hero.kicker" />
            <U as="h1" className="s-hero__h1" k="hero.tagline" />
            <U as="p" className="s-lead" k="hero.sub" multiline />
            <div className="s-actions"><MainActions /></div>
          </div>
          <div className="s-hero__photo">
            <Picture
              name="hero-alt" alt={t.alt.interior} ratio="4x3"
              widths={[900, 1400, 2000]} sizes="(max-width: 900px) 100vw, 44vw" priority
            />
          </div>
        </div>
        <div className="wrap">
          <ul className="s-stats">
            <li><b className="num price">{settings.minVisit} {cur}</b><U as="span" k="home.minVisitTitle" /></li>
            <li><b className="num">{items.length}</b><U as="span" k="prices.positions" /></li>
            <li><b className="num">{services.length}</b><U as="span" k="nav.services" /></li>
            <li><b>{CONTACT.radiusKm} km</b><span>{CONTACT.city}</span></li>
          </ul>
        </div>
      </section>

      {/* ================================ 3 ШАГА ================================ */}
      <section className="s-band">
        <div className="wrap">
          <U as="h2" className="s-h2" k="home.stepsHead" />
          <ol className="s-steps">
            {t.home.steps.map((s, i) => (
              <li key={s.t}>
                <span className="s-steps__n num">{i + 1}</span>
                <U as="h3" className="s-h3" k={`home.steps.${i}.t`} />
                <U as="p" className="s-text" k={`home.steps.${i}.d`} multiline />
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============================ КАЛЬКУЛЯТОР ============================ */}
      <section className="s-band calcband">
        <div className="wrap">
          <U as="h2" className="s-h2" k="home.calcHead" />
          <U as="p" className="s-lead" k="home.calcLead" multiline />
          <div className="s-calc"><Calculator /></div>
        </div>
      </section>

      {/* =============================== УСЛУГИ =============================== */}
      <section className="s-band">
        <div className="wrap">
          <div className="s-headrow">
            <U as="h2" className="s-h2" k="simple.servicesHead" />
            <Link className="s-more" to={pathOf(KEY_PAGES.prices, locale)}>
              <U k="simple.pricesLink" /> <Icon name="arrow" size={18} />
            </Link>
          </div>
          <U as="p" className="s-lead" k="home.benefitLead" multiline />
          <ServiceRows />
        </div>
      </section>

      <Facts />

      {/* =============================== ВОПРОСЫ =============================== */}
      <section className="s-band">
        <div className="wrap s-narrow">
          <E as="h2" className="s-h2" k="faq:heading" v={f.heading} />
          <Accordion items={f.items} cmsKey="faq" className="s-acc" />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
