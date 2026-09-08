import { Link } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import SparkDot from '../components/SparkDot'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { serviceAlt } from '../lib/ui'

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
          <Rule className="pagehead__rule" />
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className="blocks blocks--3 hub-grid">
            {services.map((s, i) => {
              const from = priceOf(s)
              // каждая третья — фотография в тёмной рамке, остальные — высокие карточки
              if (i % 3 === 1) {
                return (
                  <Reveal key={s.key} delay={60}>
                    <Link className="panel panel--card panel--mono hub-photo" to={s.paths[locale]}>
                      <Picture name={s.image!} alt={serviceAlt(s.tr[locale].h1)} ratio="3x2" widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 30vw" />
                      <span className="badge badge--accent badge--bl team__badge">
                        <span className="badge__dot"><SparkDot tone="accent" /></span>
                        <span className="badge__text"><b>{s.tr[locale].h1.split(' — ')[0]}</b><small>{from !== null ? `${t.prices.from} ${from} ${cur}` : s.tr[locale].blurb}</small></span>
                      </span>
                    </Link>
                  </Reveal>
                )
              }
              const tone = i % 6 === 0 ? ' blk--forest' : i % 6 === 2 ? ' blk--accent' : ''
              return (
                <Reveal key={s.key} delay={(i % 3) * 60}>
                  <Link className={`blk blk--tall${tone}`} to={s.paths[locale]}>
                    <p className="blk__n">{String(i + 1).padStart(2, '0')}</p>
                    <div>
                      <h2 className="blk__t">{s.tr[locale].h1}</h2>
                      <p className="blk__s">{s.tr[locale].blurb}{from !== null ? ` · ${t.prices.from} ${from} ${cur}` : ''}</p>
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
