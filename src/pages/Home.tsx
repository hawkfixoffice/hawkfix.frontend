import { Link } from 'react-router-dom'
import { KEY_PAGES, groups, items, pathOf, services, settings } from '../data/content'
import { faq } from '../data/faq'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import Calculator from '../components/calc/Calculator'
import { CONTACT } from '../lib/ui'

export default function Home() {
  const { locale, t, page } = usePage()
  const f = faq[locale]
  const cur = settings.currency

  const groupRows = groups
    .map((g) => {
      const list = items.filter((i) => i.group === g.key)
      return list.length ? { g, from: Math.min(...list.map((i) => i.price)), n: list.length } : null
    })
    .filter(Boolean) as { g: (typeof groups)[number]; from: number; n: number }[]

  const priceOf = (s: (typeof services)[number]) => {
    const list = s.group ? items.filter((i) => i.group === s.group) : []
    return list.length ? Math.min(...list.map((i) => i.price)) : settings.minVisit
  }

  const featured = services[0]
  const grid = services.slice(1, 7)

  return (
    <>
      {/* ============================= ГЕРОЙ ============================= */}
      <section className="hero">
        <div className="hero__media">
          <Picture name="hero" alt="" ratio="16x9" widths={[1200, 1800, 2600]} sizes="100vw" priority />
        </div>

        <div className="wrap hero__in">
          <p className="hero__eyebrow">{t.hero.eyebrow}</p>
          <h1 className="hero__tagline">
            {t.hero.tagline.split('\n').map((line, i) => <span key={i}>{line}</span>)}
          </h1>
          <p className="hero__pill">
            <Icon name="pin" size={15} /> {t.hero.kicker}
          </p>
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

      {/* ========================= ЧТО ДЕЛАЕМ ========================= */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <p className="label">{t.home.benefitLabel}</p>
            <h2 className="benefit__head">
              {t.home.benefitHead}{' '}
              <Picture name="drains" alt="" ratio="3x2" widths={[800]} sizes="118px" className="inline-chip" />{' '}
              {t.home.benefitHeadTail}
            </h2>
          </Reveal>

          <div className="blocks blocks--3-1-2 benefit__grid">
            {/* левая колонка: минимум выезда + аккордеон вопросов */}
            <Reveal delay={60}>
              <div className="stack" style={{ ['--stack-gap' as string]: 'clamp(10px,1.2vw,16px)' }}>
                <div className="blk blk--accent">
                  <p className="blk__n">{t.home.minVisitTitle}</p>
                  <p className="blk__v">{settings.minVisit} {cur}</p>
                  <p className="blk__s">{t.home.minVisitNote}</p>
                </div>
                <div className="acc">
                  {f.items.slice(0, 3).map((x) => (
                    <details key={x.q}>
                      <summary>
                        {x.q}
                        <span className="acc__sign"><Icon name="plus" size={18} /></span>
                      </summary>
                      <p className="acc__body">{x.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* правая колонка: фото-панель с бейджами и плавающей карточкой */}
            <Reveal delay={120}>
              <div className="blocks blocks--wide-right benefit__right">
                <div className="stack" style={{ ['--stack-gap' as string]: 'clamp(10px,1.2vw,16px)' }}>
                  <div className="blk blk--mute">
                    <p className="blk__n">{t.home.pricesLabel}</p>
                    <p className="blk__v">{items.length}</p>
                    <p className="blk__s">{t.prices.positions}</p>
                  </div>
                  <div className="blk blk--dark">
                    <p className="blk__n">{t.nav.services}</p>
                    <p className="blk__v">{services.length}</p>
                    <Link className="btn btn--onDark" to={pathOf(KEY_PAGES.services, locale)}>
                      {t.cta.allServices} <Icon name="arrow" size={16} />
                    </Link>
                  </div>
                </div>

                <div className="panel panel--fill benefit__photo">
                  <Picture
                    name={featured.image!} alt={featured.tr[locale].h1} ratio="4x3"
                    widths={[800, 1200]} sizes="(max-width: 900px) 100vw, 40vw"
                  />
                  <span className="badge badge--tl">{featured.tr[locale].h1}</span>
                  <div className="float-card">
                    <p className="float-card__t">{t.service.priceFrom}</p>
                    <p className="float-card__v">{priceOf(featured)} {cur}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ========================== КАК ЭТО РАБОТАЕТ ========================== */}
      <section className="band band--tight">
        <div className="wrap">
          <Reveal>
            <div className="secthead">
              <div>
                <p className="label">{t.home.stepsLabel}</p>
                <h2>{t.home.stepsHead}</h2>
              </div>
              <a className="btn-round" href="#wycena" aria-label={t.cta.quote}>
                <Icon name="arrow" size={22} />
              </a>
            </div>
          </Reveal>

          <div className="blocks blocks--3">
            {t.home.steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 90}>
                <div className={`blk step-blk${i === 1 ? ' blk--dark' : ''}`}>
                  <p className="blk__n">0{i + 1} / 0{t.home.steps.length}</p>
                  <h3 className="blk__t">{s.t}</h3>
                  <p className="blk__s">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ КАЛЬКУЛЯТОР ============================ */}
      <section className="band band--tight calcband">
        <div className="wrap">
          <Reveal>
            <div className="calcband__head">
              <div>
                <p className="label">{t.home.calcLabel}</p>
                <h2>{t.home.calcHead}</h2>
              </div>
              <p className="calcband__lead">{t.home.calcLead}</p>
            </div>
          </Reveal>
          <Calculator />
        </div>
      </section>

      {/* ============================== УСЛУГИ ============================== */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="secthead">
              <div>
                <p className="label">{t.home.servicesLabel}</p>
                <h2>
                  {t.home.servicesHead}{' '}
                  <Picture name="painting" alt="" ratio="3x2" widths={[800]} sizes="118px" className="inline-chip" />{' '}
                  {t.home.servicesLead}
                </h2>
              </div>
              <Link className="btn-round" to={pathOf(KEY_PAGES.services, locale)} aria-label={t.cta.allServices}>
                <Icon name="arrowUpRight" size={22} />
              </Link>
            </div>
          </Reveal>

          <div className="svc-grid">
            {grid.map((s, i) => (
              <Reveal key={s.key} delay={(i % 3) * 70}>
                <Link className="panel svc-tile" to={s.paths[locale]}>
                  <Picture
                    name={s.image!} alt={s.tr[locale].h1} ratio="3x2"
                    widths={[800, 1200]} sizes="(max-width: 900px) 100vw, 32vw"
                  />
                  {/* Цену показываем только там, где она своя: у услуг без группы
                      это был бы один и тот же общий минимум на всех плитках. */}
                  {s.group && (
                    <span className="badge badge--accent badge--tr num">
                      {t.prices.from} {priceOf(s)} {cur}
                    </span>
                  )}
                  <div className="svc-tile__body">
                    <h3>{s.tr[locale].h1}</h3>
                    <p>{s.tr[locale].blurb}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ ЦЕНЫ (тёмная) ============================ */}
      <section className="band band--dark">
        <div className="wrap">
          <Reveal>
            <div className="secthead">
              <div>
                <p className="label label--dark">{t.home.pricesLabel}</p>
                <h2>{t.home.pricesHead}</h2>
              </div>
              <p className="secthead__aside">{t.home.pricesLead}</p>
            </div>
          </Reveal>

          <ul className="rows">
            {groupRows.map(({ g, from, n }, i) => (
              <Reveal as="li" key={g.key} delay={Math.min(i, 6) * 45}>
                <Link
                  className={`row-link${i === 0 ? ' row-link--hot' : ''}`}
                  to={`${pathOf(KEY_PAGES.prices, locale)}#${g.key}`}
                >
                  <span className="row-link__title">{g.name[locale] ?? g.key}</span>
                  <span className="row-link__meta">
                    <span className="row-link__price num">
                      {t.prices.from} {from} {cur} · {n} {t.prices.positions}
                    </span>
                    <Icon name="arrowUpRight" className="row-link__arrow" size={20} />
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ========================= ЧТО БЕСПОКОИТ ========================= */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="secthead">
              <div>
                <p className="label">{f.heading}</p>
                <h2>{t.home.reviewsHead}</h2>
              </div>
            </div>
          </Reveal>

          <div className="blocks blocks--wide-left">
            <Reveal delay={60}>
              <div className="blocks blocks--2 faq-blocks">
                {f.items.map((x, i) => (
                  <div className={`blk${i === 0 ? ' blk--mute' : ''}`} key={x.q}>
                    <p className="blk__n">0{i + 1}</p>
                    <h3 className="blk__t">{x.q}</h3>
                    <p className="blk__s">{x.a}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="panel panel--fill about-panel">
                <Picture
                  name="hero-alt" alt="" ratio="4x3" widths={[900, 1400]}
                  sizes="(max-width: 900px) 100vw, 34vw"
                />
                <span className="badge badge--dark badge--tl">{t.nav.about}</span>
                <div className="float-card">
                  <p className="float-card__t">{page.tr[locale].description}</p>
                  <Link className="btn btn--dark" to={pathOf(KEY_PAGES.about, locale)}>
                    {t.cta.more} <Icon name="arrow" size={16} />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
