import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import SparkDot from '../components/SparkDot'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { CONTACT, serviceAlt } from '../lib/ui'

export default function ServicePage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const cur = settings.currency

  const groupItems = page.group ? items.filter((i) => i.group === page.group) : []
  const priceFrom = groupItems.length ? Math.min(...groupItems.map((i) => i.price)) : settings.minVisit

  const idx = services.findIndex((s) => s.key === page.key)
  const others = [...services.slice(idx + 1), ...services.slice(0, idx)].slice(0, 3)

  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <Breadcrumbs trail={[
            { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
            { name: t.nav.services, to: pathOf(KEY_PAGES.services, locale) },
            { name: tr.h1, to: page.paths[locale] },
          ]} />
          <div className="pagehead__split">
            <div>
              <h1>{tr.h1}</h1>
              <p className="pagehead__lead">{tr.blurb}</p>
            </div>
            <div className="blocks blocks--stat pagehead__stats">
              <div className="blk blk--accent">
                <p className="blk__n">{t.service.priceFrom}</p>
                <p className="blk__v">{priceFrom} {cur}</p>
              </div>
              {groupItems.length > 0 && (
                <div className="blk blk--forest">
                  <p className="blk__n">{t.nav.prices}</p>
                  <p className="blk__v">{groupItems.length}</p>
                </div>
              )}
            </div>
          </div>
          <Rule className="pagehead__rule" />
        </div>
      </section>

      {/* фото и то, что входит */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="blocks blocks--wide-right">
            <Reveal>
              <div className="panel panel--card panel--mono panel--fill svc-photo">
                <Picture
                  name={page.image!} alt={serviceAlt(tr.h1)} ratio="4x3"
                  widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 40vw" priority
                />
                <span className="badge badge--accent badge--plain badge--tl">{tr.h1.split(' — ')[0]}</span>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <div className="blocks blocks--2 svc-blocks">
                {body.intro?.map((x: string) => (
                  <div className="blk blk--mute svc-blocks__wide" key={x}>
                    <p className="blk__s blk__s--lead">{x}</p>
                  </div>
                ))}
                {body.checklist?.map((c: string, i: number) => (
                  <div className={`blk blk--xs blk--line${i === 0 ? ' blk--forest' : i === 1 ? ' blk--accent' : ''}`} key={c}>
                    <p className="blk__n">{String(i + 1).padStart(2, '0')}</p>
                    <p className="blk__t blk__t--sm">{c}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* цены группы полосами */}
      {groupItems.length > 0 && (
        <section className="band band--tight">
          <div className="wrap">
            <h2 className="sec-h2">{t.nav.prices}</h2>
            <div className="vbars">
              {groupItems.map((i, n) => (
                <Reveal key={i.key} delay={Math.min(n, 6) * 40}>
                  <div className={`vbar${n === 0 ? ' vbar--accent' : ''}`}>
                    <span className="vbar__label">
                      <span className="vbar__name">{i.name[locale]}</span>
                      <span className="vbar__meta">{settings.units[locale]?.[i.unit] ?? i.unit}</span>
                    </span>
                    <span className="vbar__v num">{i.price} {cur}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* примечание и связь */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="blocks blocks--wide-left">
            {body.note?.length ? (
              <Reveal>
                <div className="blk detail__note">
                  {body.note.map((x: string) => <p key={x}>{x}</p>)}
                </div>
              </Reveal>
            ) : <div />}
            <Reveal delay={70}>
              <div className="blk blk--dark svc-cta">
                <h2 className="blk__t">{t.home.ctaHead}</h2>
                <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                  {t.service.askAbout} <Icon name="arrow" size={17} />
                </Link>
                <a className="btn btn--onDark" href={CONTACT.phoneHref}>
                  <Icon name="phone" size={16} /> {CONTACT.phone}
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* другие услуги */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="sechead">
            <h2 className="h-big">{t.service.other}</h2>
            <Link className="btn btn--ghost" to={pathOf(KEY_PAGES.services, locale)}>
              {t.service.backToServices} <Icon name="arrow" size={16} />
            </Link>
          </div>
          <div className="team">
            <Link className="ring-btn team__go" to={pathOf(KEY_PAGES.services, locale)} aria-label={t.service.backToServices}>
              <Icon name="arrow" size={26} />
            </Link>
            {others.map((s) => (
              <Link className="panel panel--mono team__card" key={s.key} to={s.paths[locale]}>
                <Picture name={s.image!} alt={serviceAlt(s.tr[locale].h1)} ratio="3x2" widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 30vw" />
                <span className="badge badge--accent badge--bl team__badge">
                  <span className="badge__dot"><SparkDot tone="accent" /></span>
                  <span className="badge__text"><b>{s.tr[locale].h1.split(' — ')[0]}</b><small>{s.tr[locale].blurb}</small></span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
