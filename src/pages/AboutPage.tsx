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
              <h1>{tr.h1}</h1>
              <p className="pagehead__lead">{tr.description}</p>
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <p className="blk__n">{t.home.minVisitTitle}</p>
                <p className="blk__v">{settings.minVisit} {settings.currency}</p>
              </div>
              <div className="blk blk--mute">
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
                    <p className="blk__s blk__s--lead">{x}</p>
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
              <h2 className="sec-h2">{sec.heading}</h2>
            </Reveal>
            {sec.paras.map((x) => <p className="prose sec-p" key={x}>{x}</p>)}
            <div className="blocks blocks--3">
              {(sec.lists[0] ?? []).map((x, i) => (
                <Reveal key={x} delay={(i % 3) * 70}>
                  <div className={`blk blk--xs blk--line${i === 0 ? ' blk--forest' : i === 1 ? ' blk--accent' : ''}`}>
                    <p className="blk__n">{String(i + 1).padStart(2, '0')}</p>
                    <p className="blk__t blk__t--sm">{x}</p>
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
                  <h2 className="sec-h2">{qa?.heading}</h2>
                  <Accordion items={qaPairs} className="acc--gap" />
                </div>
              </Reveal>
              <Reveal delay={90}>
                <div className="panel panel--card panel--mono panel--fill about-hero">
                  <Picture name="hero-alt" alt={t.alt.interior} ratio="4x3" widths={[900, 1400, 2000]} sizes="(max-width:900px) 100vw, 34vw" />
                  <Link className="badge badge--accent badge--bl" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                    <span className="badge__text">{t.cta.quote}</span>
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
