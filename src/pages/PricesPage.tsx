import { useLoaderData } from 'react-router-dom'
import { settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Icon from '../components/Icon'
import { CtaBand, MainActions, PageHead } from '../components/Simple'
import { PT, U } from '../cms/E'
import { useCatalog } from '../lib/catalog'
import { PTYPE_LABEL, bySub, minPrice, nameOf, priceText, ptypeOf } from '../lib/price'

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
      <PageHead
        lead={tr.description} actions={<MainActions />}
        aside={
          <ul className="s-keyfacts">
            <li><U as="span" k="home.minVisitTitle" /><b className="num">{settings.minVisit} {cur}</b></li>
            <li><U as="span" k="form.urgent" /><b className="num">+{settings.urgentPct}%</b></li>
            <li><U as="span" k="prices.positions" /><b className="num">{items.length}</b></li>
          </ul>
        }
      />

      {shortLists.length > 0 && (
        <section className="s-band s-band--first">
          <div className="wrap s-cols">
            {shortLists.slice(0, 2).map((sec, i) => (
              <div key={sec.heading}>
                <PT as="h2" className="s-h3" v={sec.heading ?? ''} />
                <ul className="s-checks" data-neg={i === 1 || undefined}>
                  {(sec.lists[0] ?? []).map((x) => (
                    <li key={x}><Icon name={i === 0 ? 'check' : 'minus'} size={20} /><PT v={x} multiline /></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="s-band">
        <div className="wrap s-narrow">
          <nav className="s-jump" aria-label={t.prices.group}>
            {rows.map(({ g }) => (
              <a key={g.key} href={`#${g.key}`}>{g.name[locale] ?? g.key}</a>
            ))}
          </nav>

          {rows.map(({ g, list }) => (
            <section className="s-pgroup" id={g.key} key={g.key}>
              <div className="s-pgroup__head">
                <h2 className="s-h3">{g.name[locale] ?? g.key}</h2>
                <p className="num">{t.prices.from} {minPrice(list)} {cur}</p>
              </div>
              {bySub(list, subgroups.filter((x) => x.group === g.key)).map((part) => (
                <div key={part.key || 'rest'}>
                  {part.name && <h3 className="s-pgroup__sub">{nameOf({ name: part.name }, locale)}</h3>}
                  <ul className="s-prices">
                    {part.list.map((i) => {
                      const pt = priceText(i, locale, settings)
                      return (
                        <li key={i.key}>
                          <span>
                            {nameOf(i, locale)}
                            {ptypeOf(i) !== 'fixed' && <small> · {PTYPE_LABEL[ptypeOf(i)][locale]}</small>}
                          </span>
                          <b className="num">{pt.main}{pt.unit && <small> / {pt.unit}</small>}</b>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}

          {notes.map((sec) => (
            <div className="s-prose s-note" key={sec.heading || sec.paras[0]}>
              {sec.heading && <PT as="h2" className="s-h3" v={sec.heading} />}
              {sec.paras.map((x) => <PT as="p" key={x} v={x} multiline />)}
            </div>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  )
}
