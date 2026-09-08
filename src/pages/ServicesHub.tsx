import { Link } from 'react-router-dom'
import { KEY_PAGES, pathOf, services } from '../data/content'
import { usePage } from '../components/PageContext'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'

export default function ServicesHub() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]

  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <Breadcrumbs trail={[
            { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
            { name: tr.h1, to: page.paths[locale] },
          ]} />
          <h1>{tr.h1}</h1>
          <p className="pagehead__lead prose">{tr.description}</p>
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className="grid grid--3">
            {services.map((s, i) => (
              <Reveal key={s.key} delay={(i % 3) * 60}>
              <Link className="card card--flush svc" to={s.paths[locale]}>
                <div className="media media--3x2">
                  <Picture name={s.image!} alt={s.tr[locale].h1} sizes="(max-width: 900px) 100vw, 32vw" />
                </div>
                <div className="svc__body">
                  <h2>{s.tr[locale].h1}</h2>
                  <p>{s.tr[locale].blurb}</p>
                </div>
                <span className="svc__go" aria-hidden="true"><Icon name="arrowUpRight" size={18} /></span>
              </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
