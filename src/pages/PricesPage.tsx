import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, groups, items, pathOf, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Blocks from '../components/Blocks'
import Breadcrumbs from '../components/Breadcrumbs'
import Icon from '../components/Icon'

export default function PricesPage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const rows = groups
    .map((g) => ({ g, list: items.filter((i) => i.group === g.key) }))
    .filter((x) => x.list.length)

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
          <div className="pagehead__actions">
            <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
              {t.cta.quote} <Icon name="arrow" size={17} />
            </Link>
          </div>
        </div>
      </section>

      {/* Оглавление по группам — чтобы 105 позиций не превращались в стену */}
      <section className="band band--tight">
        <div className="wrap">
          <nav className="toc" aria-label={t.prices.group}>
            {rows.map(({ g, list }) => (
              <a className="chip" key={g.key} href={`#${g.key}`}>
                {g.name[locale] ?? g.key}
                <span className="num">{list.length}</span>
              </a>
            ))}
          </nav>

          <div className="pricegroups">
            {rows.map(({ g, list }) => (
              <section className="pricegroup" id={g.key} key={g.key}>
                <div className="pricegroup__head">
                  <h2>{g.name[locale] ?? g.key}</h2>
                  <p className="num">
                    {t.prices.from} {Math.min(...list.map((i) => i.price))} {settings.currency}
                  </p>
                </div>
                <ul className="pricelist">
                  {list.map((i) => (
                    <li key={i.key}>
                      <span>{i.name[locale]}</span>
                      <span className="num">
                        {i.price} {settings.currency}
                        <small> / {settings.units[locale]?.[i.unit] ?? i.unit}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="doc doc--wide pricenotes">
            <Blocks blocks={body.blocks} />
          </div>
        </div>
      </section>
    </>
  )
}
