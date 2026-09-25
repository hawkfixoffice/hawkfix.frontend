import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { isQaList, toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import Accordion from '../components/Accordion'
import { CONTACT } from '../lib/ui'
import { PT, U } from '../cms/E'

export default function AboutPage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const sections = toSections(body.blocks)

  const intro = sections.find((s) => !s.heading)
  const rest = sections.filter((s) => s.heading && !isQaList(s.lists[0] ?? []))
  const qa = sections.find((s) => isQaList(s.lists[0] ?? []))
  const qaPairs = qa
    ? (qa.lists[0] ?? []).reduce<{ q: string; a: string }[]>((acc, x, i, arr) => {
        if (i % 2 === 0) acc.push({ q: x, a: arr[i + 1] })
        return acc
      }, [])
    : []

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
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <U as="p" className="blk__n" k="home.minVisitTitle" />
                <p className="blk__v">{settings.minVisit} {settings.currency}</p>
              </div>
              <div className="blk blk--mute">
                <U as="p" className="blk__n" k="nav.services" />
                <p className="blk__v">{services.length}</p>
              </div>
              <div className="blk blk--forest">
                <U as="p" className="blk__n" k="nav.prices" />
                <p className="blk__v">{items.length}</p>
              </div>
            </div>
          </div>
          <Rule className="pagehead__rule" />
        </div>
      </section>

      {/* фото + вводные абзацы */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="blocks blocks--wide-right">
            <Reveal>
              <div className="panel panel--card panel--mono panel--fill about-hero">
                <Picture name="about" alt={t.alt.about} ratio="4x3" widths={[800, 1200, 1600]} sizes="(max-width:900px) 100vw, 40vw" />
                <span className="badge badge--accent badge--plain badge--tl">{CONTACT.city} · {CONTACT.radiusKm} km</span>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="blocks blocks--2">
                {(intro?.paras ?? []).slice(0, 4).map((x, i) => (
                  <div className={`blk blk--tall${i === 0 ? ' blk--forest' : i === 3 ? ' blk--accent' : ''}`} key={x}>
                    <p className="blk__n">0{i + 1}</p>
                    <PT as="p" className="blk__s blk__s--lead" v={x} multiline />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* секции со списками: снаряжение, правила */}
      {rest.map((sec) => (
        <section className="band band--tight" key={sec.heading}>
          <div className="wrap">
            <Reveal>
              <PT as="h2" className="sec-h2" v={sec.heading ?? ''} />
            </Reveal>
            {sec.paras.map((x) => <PT as="p" className="prose sec-p" key={x} v={x} multiline />)}
            <div className="blocks blocks--3">
              {(sec.lists[0] ?? []).map((x, i) => (
                <Reveal key={x} delay={(i % 3) * 70}>
                  <div className={`blk blk--xs blk--line${i === 0 ? ' blk--forest' : i === 1 ? ' blk--accent' : ''}`}>
                    <p className="blk__n">{String(i + 1).padStart(2, '0')}</p>
                    <PT as="p" className="blk__t blk__t--sm" v={x} multiline />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* что беспокоит — аккордеон */}
      {qaPairs.length > 0 && (
        <section className="band band--tight">
          <div className="wrap">
            <div className="blocks blocks--wide-left blocks--top">
              <Reveal>
                <div>
                  <PT as="h2" className="sec-h2" v={qa?.heading ?? ''} />
                  <Accordion items={qaPairs} className="acc--gap" cmsKey={`page:${page.key}:qa`} />
                </div>
              </Reveal>
              <Reveal delay={90}>
                <div className="panel panel--card panel--mono panel--fill about-hero">
                  <Picture name="hero-alt" alt={t.alt.interior} ratio="4x3" widths={[900, 1400, 2000]} sizes="(max-width:900px) 100vw, 34vw" />
                  <Link className="badge badge--accent badge--bl" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                    <U as="span" className="badge__text" k="cta.quote" />
                    <span className="badge__dot"><Icon name="arrow" size={18} /></span>
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
