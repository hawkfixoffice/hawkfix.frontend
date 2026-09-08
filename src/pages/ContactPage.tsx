import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, pathOf, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { CONTACT } from '../lib/ui'

export default function ContactPage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const sections = toSections(body.blocks)
  const intro = sections.find((s) => !s.heading)
  // Список районов — самый длинный список на странице
  const districts = sections.flatMap((s) => s.lists).sort((a, b) => b.length - a.length)[0] ?? []
  const districtSec = sections.find((s) => s.lists.includes(districts))
  const rest = sections.filter((s) => s.heading && s !== districtSec)

  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <Breadcrumbs trail={[
            { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
            { name: tr.h1, to: page.paths[locale] },
          ]} />
          <h1>{tr.h1}</h1>
          <p className="pagehead__lead">{tr.description}</p>
          <Rule className="pagehead__rule" />
        </div>
      </section>

      {/* три способа связи + фото */}
      <section className="band band--tight">
        <div className="wrap">
          <Reveal>
            <div className="blocks blocks--3 contact-cards">
                <a className="blk blk--tall blk--forest contact-card" href={CONTACT.phoneHref}>
                  <Icon name="phone" size={22} />
                  <p className="blk__t">{t.cta.call}</p>
                  <p className="contact-card__v num">{CONTACT.phone}</p>
                </a>
                <a
                  className="blk blk--tall blk--accent contact-card"
                  href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener"
                >
                  <Icon name="whatsapp" size={22} />
                  <p className="blk__t">{t.cta.whatsapp}</p>
                  <p className="contact-card__v num">+{CONTACT.whatsapp}</p>
                </a>
                <a className="blk blk--tall contact-card" href={`mailto:${CONTACT.email}`}>
                  <Icon name="mail" size={22} />
                  <p className="blk__t">E-mail</p>
                  <p className="contact-card__v">{CONTACT.email}</p>
                </a>
            </div>
          </Reveal>

          <div className="blocks blocks--wide-left contact-below">
            <Reveal delay={60}>
              <div className="blocks blocks--2 contact-notes">
                {(intro?.paras ?? []).map((x) => (
                  <div className="blk" key={x}>
                    <p className="blk__s blk__s--lead">{x}</p>
                  </div>
                ))}
                {rest.map((sec) => (
                  <div className="blk" key={sec.heading}>
                    {sec.eyebrow && <p className="blk__n">{sec.eyebrow}</p>}
                    <h2 className="blk__t">{sec.heading}</h2>
                    {sec.paras.map((x) => <p className="blk__s" key={x}>{x}</p>)}
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="panel panel--card panel--mono panel--fill contact-photo">
                <Picture name="moveout" alt={t.alt.keys} ratio="4x3" widths={[800, 1200, 1600]} sizes="(max-width:900px) 100vw, 34vw" />
                <span className="sticker" style={{ left: -26, top: '38%' }}>{CONTACT.city}<br />{CONTACT.radiusKm} km</span>
                <span className="badge badge--accent badge--bl">
                  <span className="badge__text">{t.home.minVisitTitle} — {settings.minVisit} {settings.currency}</span>
                  <span className="badge__dot"><Icon name="check" size={18} /></span>
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* районы */}
      {districts.length > 0 && (
        <section className="band band--tight">
          <div className="wrap">
            <Reveal>
              <h2 className="sec-h2">{districtSec?.heading}</h2>
              {/* абзацы этой секции — часть текста старого сайта, не теряем их */}
              {districtSec?.paras.map((x) => <p className="prose sec-p" key={x}>{x}</p>)}
              <div className="chipwall">
                {districts.map((d) => <span className="chip" key={d}>{d}</span>)}
              </div>
            </Reveal>
          </div>
        </section>
      )}

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
