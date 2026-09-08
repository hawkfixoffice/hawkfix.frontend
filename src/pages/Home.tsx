import { Link } from 'react-router-dom'
import { KEY_PAGES, groups, items, pathOf, services, settings } from '../data/content'
import { faq } from '../data/faq'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Calculator from '../components/calc/Calculator'
import { CONTACT } from '../lib/ui'

export default function Home() {
  const { locale, t, page } = usePage()
  const f = faq[locale]
  const minVisit = settings.minVisit
  const featured = services.slice(0, 6)

  // «от какой цены» по каждой группе — для тёмной секции с ценами
  const groupRows = groups
    .map((g) => {
      const list = items.filter((i) => i.group === g.key)
      return list.length ? { g, from: Math.min(...list.map((i) => i.price)), n: list.length } : null
    })
    .filter(Boolean) as { g: (typeof groups)[number]; from: number; n: number }[]

  return (
    <>
      {/* ============ ГЕРОЙ ============ */}
      <section className="hero">
        <div className="hero__media">
          <Picture
            name="hero" alt="" ratio="16x9" widths={[1200, 1800, 2600]}
            sizes="100vw" priority
          />
        </div>
        <div className="wrap hero__in">
          <p className="hero__kicker">
            <Icon name="pin" size={15} /> {t.hero.kicker}
          </p>
          <h1 className="hero__tagline">
            {t.hero.tagline.split('\n').map((line, i) => <span key={i}>{line}</span>)}
          </h1>
          <p className="hero__sub">{t.hero.sub}</p>
          <div className="hero__actions">
            <a className="btn btn--primary" href="#wycena">
              {t.cta.quote} <Icon name="arrow" size={17} />
            </a>
            <a className="btn btn--onDark" href={CONTACT.phoneHref}>
              <Icon name="phone" size={16} /> {CONTACT.phone}
            </a>
          </div>
        </div>
        <div className="hero__mark" aria-hidden="true">
          <p className="wordmark">HAWK<span className="wordmark__dot">.</span>FIX</p>
        </div>
      </section>

      {/* ============ ЧТО ДЕЛАЕМ ============ */}
      <section className="band">
        <div className="wrap">
          <p className="label">{t.home.benefitLabel}</p>
          <div className="benefit">
            <h2 className="benefit__head">
              {t.home.benefitHead}{' '}
              <Picture name="furniture" alt="" ratio="3x2" widths={[800]} sizes="96px" className="inline-chip" />{' '}
              {t.home.benefitHeadTail}
            </h2>
            <p className="benefit__lead prose">{t.home.benefitLead}</p>
          </div>

          <div className="grid grid--sidebar benefit__cards">
            <div className="grid grid--2">
              {featured.slice(0, 4).map((s) => (
                <Link className="card card--flush svc" key={s.key} to={s.paths[locale]}>
                  <div className="media media--3x2">
                    <Picture name={s.image!} alt={s.tr[locale].h1} sizes="(max-width: 640px) 100vw, 32vw" />
                  </div>
                  <div className="svc__body">
                    <h3>{s.tr[locale].h1}</h3>
                    <p>{s.tr[locale].blurb}</p>
                  </div>
                  <span className="svc__go" aria-hidden="true"><Icon name="arrowUpRight" size={18} /></span>
                </Link>
              ))}
            </div>

            <div className="stack" style={{ ['--stack-gap' as string]: 'var(--sp-4)' }}>
              <div className="card card--accent">
                <p className="stat__unit">{t.home.minVisitTitle}</p>
                <p className="stat__num">{minVisit} {settings.currency}</p>
                <p className="minvisit__note">{t.home.minVisitNote}</p>
              </div>
              <div className="card">
                <p className="label">{t.home.pricesLabel}</p>
                <p className="stat__num">{items.length}</p>
                <p className="stat__unit">{t.prices.positions}</p>
                <Link className="btn btn--ghost" to={pathOf(KEY_PAGES.prices, locale)} style={{ marginTop: 'var(--sp-4)' }}>
                  {t.nav.prices} <Icon name="arrow" size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ КАЛЬКУЛЯТОР ============ */}
      <section className="band band--tight calcband">
        <div className="wrap">
          <div className="calcband__head">
            <div>
              <p className="label">{t.home.calcLabel}</p>
              <h2>{t.home.calcHead}</h2>
            </div>
            <p className="calcband__lead prose">{t.home.calcLead}</p>
          </div>
          <Calculator />
        </div>
      </section>

      {/* ============ КАК ЭТО РАБОТАЕТ ============ */}
      <section className="band">
        <div className="wrap">
          <p className="label">{t.home.stepsLabel}</p>
          <h2 className="steps__head">{t.home.stepsHead}</h2>
          <ol className="grid grid--3 steps">
            {t.home.steps.map((s, i) => (
              <li className="card step" key={s.t}>
                <p className="step__n num">0{i + 1}</p>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ УСЛУГИ ============ */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="secthead">
            <div>
              <p className="label">{t.home.servicesLabel}</p>
              <h2>
                {t.home.servicesHead}{' '}
                <Picture name="painting" alt="" ratio="3x2" widths={[800]} sizes="96px" className="inline-chip" />{' '}
                {t.home.servicesLead}
              </h2>
            </div>
            <Link className="btn-round" to={pathOf(KEY_PAGES.services, locale)} aria-label={t.cta.allServices}>
              <Icon name="arrowUpRight" size={22} />
            </Link>
          </div>

          <div className="grid grid--3">
            {featured.map((s) => (
              <Link className="card card--flush svc" key={s.key} to={s.paths[locale]}>
                <div className="media media--3x2">
                  <Picture name={s.image!} alt={s.tr[locale].h1} sizes="(max-width: 900px) 100vw, 32vw" />
                </div>
                <div className="svc__body">
                  <h3>{s.tr[locale].h1}</h3>
                  <p>{s.tr[locale].blurb}</p>
                </div>
                <span className="svc__go" aria-hidden="true"><Icon name="arrowUpRight" size={18} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ЦЕНЫ (тёмная секция) ============ */}
      <section className="band band--dark">
        <div className="wrap">
          <div className="secthead">
            <div>
              <p className="label label--dark">{t.home.pricesLabel}</p>
              <h2>{t.home.pricesHead}</h2>
            </div>
            <p className="prose" style={{ maxWidth: '38ch' }}>{t.home.pricesLead}</p>
          </div>

          <ul className="rows">
            {groupRows.map(({ g, from, n }, i) => (
              <li key={g.key}>
                <Link
                  className={`row-link${i === 0 ? ' row-link--hot' : ''}`}
                  to={`${pathOf(KEY_PAGES.prices, locale)}#${g.key}`}
                >
                  <span className="row-link__title">{g.name[locale] ?? g.key}</span>
                  <span className="row-link__meta">
                    <span className="row-link__price num">
                      {t.prices.from} {from} {settings.currency} · {n} {t.prices.positions}
                    </span>
                    <Icon name="arrowUpRight" className="row-link__arrow" size={20} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ ЧТО ОБЫЧНО БЕСПОКОИТ ============ */}
      <section className="band">
        <div className="wrap">
          <div className="grid grid--sidebar faqband">
            <div>
              <p className="label">{f.heading}</p>
              <h2 className="faqband__head">{t.home.reviewsHead}</h2>
              <ul className="faq">
                {f.items.map((x) => (
                  <li className="card faq__item" key={x.q}>
                    <h3>{x.q}</h3>
                    <p>{x.a}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card card--flush faqband__media">
              <div className="media media--4x3">
                <Picture name="hero-alt" alt="" ratio="4x3" widths={[900, 1400]} sizes="(max-width: 900px) 100vw, 380px" />
              </div>
              <div className="faqband__mediaBody">
                <p className="label">{t.nav.about}</p>
                <p>{page.tr[locale].description}</p>
                <Link className="btn btn--dark" to={pathOf(KEY_PAGES.about, locale)}>
                  {t.cta.more} <Icon name="arrow" size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
