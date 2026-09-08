import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Breadcrumbs from '../components/Breadcrumbs'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import { CONTACT } from '../lib/ui'

export default function ServicePage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const groupItems = page.group ? items.filter((i) => i.group === page.group) : []
  const priceFrom = groupItems.length ? Math.min(...groupItems.map((i) => i.price)) : settings.minVisit

  // Соседние услуги: следующие по списку, по кругу
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
          <h1>{tr.h1}</h1>
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className="detail">
            <div className="card card--flush detail__media">
              <div className="media media--4x3">
                <Picture
                  name={page.image!} alt={tr.h1} ratio="4x3"
                  sizes="(max-width: 900px) 100vw, 50vw" priority
                />
              </div>
            </div>

            <div className="detail__body">
              <p className="detail__blurb">{tr.blurb}</p>
              {body.intro?.map((x: string) => <p className="detail__intro" key={x}>{x}</p>)}

              {body.checklist?.length ? (
                <>
                  <p className="label">{t.service.included}</p>
                  <ul className="checklist">
                    {body.checklist.map((c: string) => (
                      <li key={c}><Icon name="check" size={16} /><span>{c}</span></li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="detail__price card card--paper">
                <div>
                  <p className="stat__unit">{t.service.priceFrom}</p>
                  <p className="detail__priceNum num">{priceFrom} {settings.currency}</p>
                </div>
                <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
                  {t.service.askAbout} <Icon name="arrow" size={17} />
                </Link>
              </div>

              {groupItems.length > 0 && (
                <div className="detail__items">
                  <p className="label">{t.nav.prices}</p>
                  <ul className="pricelist">
                    {groupItems.map((i) => (
                      <li key={i.key}>
                        <span>{i.name[locale]}</span>
                        <span className="num">
                          {i.price} {settings.currency}
                          <small> / {settings.units[locale]?.[i.unit] ?? i.unit}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {body.note?.length ? (
                <div className="detail__note">
                  {body.note.map((x: string) => <p key={x}>{x}</p>)}
                </div>
              ) : null}

              <div className="detail__actions">
                <a className="btn btn--dark" href={CONTACT.phoneHref}>
                  <Icon name="phone" size={16} /> {CONTACT.phone}
                </a>
                <a className="btn btn--ghost" href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">
                  <Icon name="whatsapp" size={16} /> {t.cta.whatsapp}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className="secthead">
            <h2>{t.service.other}</h2>
            <Link className="btn btn--ghost" to={pathOf(KEY_PAGES.services, locale)}>
              {t.service.backToServices} <Icon name="arrow" size={16} />
            </Link>
          </div>
          <div className="grid grid--3">
            {others.map((s) => (
              <Link className="card card--flush svc" key={s.key} to={s.paths[locale]}>
                <div className="media media--3x2">
                  <Picture name={s.image!} alt={s.tr[locale].h1} sizes="(max-width: 900px) 100vw, 32vw" />
                </div>
                <div className="svc__body">
                  <h3>{s.tr[locale].h1}</h3>
                  <p>{s.tr[locale].blurb}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
