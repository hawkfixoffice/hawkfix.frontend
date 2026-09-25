import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { PT, U } from '../cms/E'
import { useCatalog } from '../lib/catalog'
import { PTYPE_LABEL, bySub, minPrice, nameOf, priceText, ptypeOf } from '../lib/price'

const GROUP_PHOTO: Record<string, string> = Object.fromEntries(
  services.filter((s) => s.group && s.image).map((s) => [s.group as string, s.image as string]),
)

export default function PricesPage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const sections = toSections(body.blocks)
  const cur = settings.currency
  // Живой прайс: правка цены в панели видна здесь сразу, без пересборки
  const { items, groups, subgroups } = useCatalog()

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
              <PT as="h1" field="h1" v={tr.h1} />
              <PT as="p" className="pagehead__lead" field="lead" v={tr.description} multiline />
              <div className="pagehead__actions">
                <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                  <U k="cta.quote" /> <Icon name="arrow" size={17} />
                </Link>
              </div>
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <U as="p" className="blk__n" k="home.minVisitTitle" />
                <p className="blk__v">{settings.minVisit} {cur}</p>
              </div>
              <div className="blk blk--mute">
                <U as="p" className="blk__n" k="nav.prices" />
                <p className="blk__v">{items.length}</p>
              </div>
              <div className="blk blk--forest">
                <U as="p" className="blk__n" k="form.urgent" />
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
                    <PT as="h2" className="blk__t" v={sec.heading ?? ''} />
                    <ul className="blk__list">
                      {(sec.lists[0] ?? []).map((x) => (
                        <li key={x}><Icon name={i === 0 ? 'check' : 'minus'} size={15} /><PT v={x} multiline /></li>
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
                    {t.prices.from} {minPrice(list)} {cur}
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
                      {t.prices.from} {minPrice(list)} {cur}
                    </p>
                  </div>
                  {bySub(list, subgroups.filter((x) => x.group === g.key)).map((part) => (
                    <div key={part.key || 'rest'}>
                      {part.name && <h3 className="pricegroup__sub">{nameOf({ name: part.name }, locale)}</h3>}
                      <ul className="pricelist">
                        {part.list.map((i) => {
                          const pt = priceText(i, locale, settings)
                          return (
                            <li key={i.key}>
                              <span>
                                {nameOf(i, locale)}
                                {ptypeOf(i) !== 'fixed' && <small className="ptype" data-t={ptypeOf(i)}>{PTYPE_LABEL[ptypeOf(i)][locale]}</small>}
                              </span>
                              <span className="num">
                                {pt.main}
                                {pt.unit && <small> / {pt.unit}</small>}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              </Reveal>
            ))}
          </div>

          {notes.length > 0 && (
            <div className="pricenotes">
              {notes.map((sec) => (
                <div key={sec.heading || sec.paras[0]}>
                  {sec.heading && <PT as="h2" className="sec-h2" v={sec.heading} />}
                  {sec.paras.map((x) => <PT as="p" key={x} v={x} multiline />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

