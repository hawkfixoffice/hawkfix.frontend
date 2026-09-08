import { Link } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import { usePage } from '../components/PageContext'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'

export default function ServicesHub() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const cur = settings.currency

  const priceOf = (s: (typeof services)[number]) => {
    const list = s.group ? items.filter((i) => i.group === s.group) : []
    return list.length ? Math.min(...list.map((i) => i.price)) : null
  }

  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <Breadcrumbs trail={[
            { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
            { name: tr.h1, to: page.paths[locale] },
          ]} />
          <div className="pagehead__split">
            <div>
              <h1>{tr.h1}</h1>
              <p className="pagehead__lead">{tr.description}</p>
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <p className="blk__n">{t.nav.services}</p>
                <p className="blk__v">{services.length}</p>
              </div>
              <div className="blk blk--forest">
                <p className="blk__n">{t.nav.prices}</p>
                <p className="blk__v">{items.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className="svc-grid">
            {services.map((s, i) => {
              const from = priceOf(s)
              return (
                <Reveal key={s.key} delay={(i % 3) * 60}>
                  <Link className="panel svc-tile" to={s.paths[locale]}>
                    <Picture
                      name={s.image!} alt={s.tr[locale].h1} ratio="3x2"
                      widths={[800, 1200]} sizes="(max-width: 900px) 100vw, 32vw"
                    />
                    {from !== null && (
                      <span className="badge badge--accent badge--tr num">
                        {t.prices.from} {from} {cur}
                      </span>
                    )}
                    <div className="svc-tile__body">
                      <h2>{s.tr[locale].h1}</h2>
                      <p>{s.tr[locale].blurb}</p>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="band band--tight ctaband">
        <div className="wrap ctaband__in">
          <div>
            <h2>{t.home.ctaHead}</h2>
            <p className="prose">{t.home.ctaLead}</p>
          </div>
          <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
            {t.cta.quote} <Icon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </>
  )
}
