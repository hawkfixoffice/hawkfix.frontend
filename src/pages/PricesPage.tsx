import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, groups, items, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'

const GROUP_PHOTO: Record<string, string> = Object.fromEntries(
  services.filter((s) => s.group && s.image).map((s) => [s.group as string, s.image as string]),
)

export default function PricesPage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const sections = toSections(body.blocks)
  const cur = settings.currency

  const rows = groups
    .map((g) => ({ g, list: items.filter((i) => i.group === g.key) }))
    .filter((x) => x.list.length)

  // «W cenie» / «Poza ceną» — два коротких списка со старой страницы
  const shortLists = sections.filter((s) => s.lists.length && (s.lists[0]?.length ?? 0) <= 8 && s.heading)
  const notes = sections.filter((s) => !s.lists.length && s.paras.length)

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
              <div className="pagehead__actions">
                <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                  {t.cta.quote} <Icon name="arrow" size={17} />
                </Link>
              </div>
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <p className="blk__n">{t.home.minVisitTitle}</p>
                <p className="blk__v">{settings.minVisit} {cur}</p>
              </div>
              <div className="blk blk--mute">
                <p className="blk__n">{t.nav.prices}</p>
                <p className="blk__v">{items.length}</p>
              </div>
              <div className="blk blk--forest">
                <p className="blk__n">{t.form.urgent}</p>
                <p className="blk__v">+{settings.urgentPct}%</p>
              </div>
            </div>
          </div>
          <Rule className="pagehead__rule" />
        </div>
      </section>

      {/* что входит и что нет — двумя контрастными блоками */}
      {shortLists.length > 0 && (
        <section className="band band--tight">
          <div className="wrap">
            <div className="blocks blocks--2">
              {shortLists.slice(0, 2).map((sec, i) => (
                <Reveal key={sec.heading} delay={i * 80}>
                  <div className={`blk blk--tall ${i === 0 ? 'blk--accent' : 'blk--forest'}`}>
                    <h2 className="blk__t">{sec.heading}</h2>
                    <ul className="blk__list">
                      {(sec.lists[0] ?? []).map((x) => (
                        <li key={x}><Icon name={i === 0 ? 'check' : 'minus'} size={15} /><span>{x}</span></li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="band band--tight">
        <div className="wrap">
          {/* Сводка «от» по группам — полосами, как в референсе */}
          <div className="vbars prices-bars">
            {rows.slice(0, 5).map(({ g, list }, i) => (
              <Reveal key={g.key} delay={i * 60}>
                <a
                  className={`vbar${i === 0 ? ' vbar--accent' : i === 1 ? ' vbar--forest' : ''}`}
                  href={`#${g.key}`}
                >
                  <span className="vbar__label">
                    <span className="vbar__name">{g.name[locale] ?? g.key}</span>
                    <span className="vbar__meta">{list.length} {t.prices.positions}</span>
                  </span>
                  <span className="vbar__v num">
                    {t.prices.from} {Math.min(...list.map((i2) => i2.price))} {cur}
                  </span>
                </a>
              </Reveal>
            ))}
          </div>

          <nav className="chipwall" aria-label={t.prices.group}>
            {rows.map(({ g, list }) => (
              <a className="chip" key={g.key} href={`#${g.key}`}>
                {g.name[locale] ?? g.key}
                <span className="num">{list.length}</span>
              </a>
            ))}
          </nav>

          <div className="pricegroups">
            {rows.map(({ g, list }, gi) => (
              <Reveal as="section" key={g.key} delay={Math.min(gi, 4) * 50}>
                <section className="pricegroup" id={g.key}>
                  <div className="pricegroup__head">
                    {GROUP_PHOTO[g.key] && (
                      <span className="pricegroup__thumb">
                        {/* Декоративная миниатюра: название группы стоит рядом текстом */}
                        <Picture name={GROUP_PHOTO[g.key]} alt="" ratio="3x2" widths={[800]} sizes="96px" />
                      </span>
                    )}
                    <h2>{g.name[locale] ?? g.key}</h2>
                    <p className="num">
                      {t.prices.from} {Math.min(...list.map((i) => i.price))} {cur}
                    </p>
                  </div>
                  <ul className="pricelist">
                    {list.map((i) => (
                      <li key={i.key}>
                        <span>{i.name[locale]}</span>
                        <span className="num">
                          {i.price} {cur}
                          <small> / {settings.units[locale]?.[i.unit] ?? i.unit}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>
            ))}
          </div>

          {notes.length > 0 && (
            <div className="pricenotes">
              {notes.map((sec) => (
                <div key={sec.heading || sec.paras[0]}>
                  {sec.heading && <h2 className="sec-h2">{sec.heading}</h2>}
                  {sec.paras.map((x) => <p key={x}>{x}</p>)}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
