import { useLoaderData } from 'react-router-dom'
import { KEY_PAGES, items, pathOf, services, settings } from '../data/content'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Accordion from '../components/Accordion'
import { CtaBand, MainActions, PageHead, ServiceRows } from '../components/Simple'
import { serviceAlt } from '../lib/ui'
import { PT, U } from '../cms/E'
import { PTYPE_LABEL, priceText, ptypeOf } from '../lib/price'
import { priceFromOf, serviceFaq } from '../lib/facts'

export default function ServicePage() {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }
  const cur = settings.currency

  const groupItems = page.group ? items.filter((i) => i.group === page.group) : []
  const idx = services.findIndex((s) => s.key === page.key)
  const others = [...services.slice(idx + 1), ...services.slice(0, idx)].slice(0, 4)
  const qa = serviceFaq(page, locale)

  return (
    <>
      <PageHead
        lead={tr.blurb ?? ''} leadField="blurb"
        crumbs={[
          { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
          { name: t.nav.services, to: pathOf(KEY_PAGES.services, locale) },
          { name: tr.h1, to: page.paths[locale] },
        ]}
        actions={<MainActions />}
        aside={
          <p className="s-price">
            <U as="span" k="service.priceFrom" />
            <b className="num">{priceFromOf(page)} {cur}</b>
          </p>
        }
      />

      {/* фото и описание */}
      <section className="s-band s-band--first">
        <div className="wrap s-split">
          <div className="s-photo">
            <Picture
              name={page.image!} alt={serviceAlt(tr.h1)} ratio="4x3"
              widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 46vw" priority
            />
          </div>
          <div className="s-prose">
            {body.intro?.map((x: string) => <PT as="p" key={x} v={x} multiline />)}
            {body.checklist?.length ? (
              <>
                <U as="h2" className="s-h3" k="simple.included" />
                <ul className="s-checks">
                  {body.checklist.map((c: string) => (
                    <li key={c}><Icon name="check" size={20} /><PT v={c} multiline /></li>
                  ))}
                </ul>
              </>
            ) : null}
            {/* без прайса примечание живёт здесь, иначе потерялось бы */}
            {!groupItems.length && body.note?.map((x: string) => <PT as="p" key={x} v={x} multiline />)}
          </div>
        </div>
      </section>

      {/* цены группы */}
      {groupItems.length > 0 && (
        <section className="s-band">
          <div className="wrap s-narrow">
            <U as="h2" className="s-h2" k="nav.prices" />
            <ul className="s-prices">
              {groupItems.map((i) => {
                const pt = priceText(i, locale, settings)
                return (
                  <li key={i.key}>
                    <span>
                      {i.name[locale]}
                      {ptypeOf(i) !== 'fixed' && <small> · {PTYPE_LABEL[ptypeOf(i)][locale]}</small>}
                    </span>
                    <b className="num">{pt.main}{pt.unit && <small> / {pt.unit}</small>}</b>
                  </li>
                )
              })}
            </ul>
            {body.note?.length ? (
              <div className="s-note">
                {body.note.map((x: string) => <PT as="p" key={x} v={x} multiline />)}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* вопросы — те же, что в FAQPage разметки страницы */}
      <section className="s-band">
        <div className="wrap s-narrow">
          <U as="h2" className="s-h2" k="sfaq.head" />
          <Accordion items={qa} className="s-acc" />
        </div>
      </section>

      <section className="s-band">
        <div className="wrap">
          <U as="h2" className="s-h2" k="simple.otherHead" />
          <ServiceRows list={others} blurbs={false} />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
