import { useLoaderData } from 'react-router-dom'
import type { PageBody } from '../lib/types'
import { toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Icon from '../components/Icon'
import { CtaBand, PageHead } from '../components/Simple'
import { CONTACT } from '../lib/ui'
import { PT, U } from '../cms/E'

export default function ContactPage() {
  const { page, locale } = usePage()
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
      <PageHead lead={tr.description} />

      {/* два способа связи — крупными строками, во всю ширину */}
      <section className="s-band s-band--first">
        <div className="wrap">
          <ul className="s-contacts">
            <li>
              <a href={CONTACT.whatsappHref} target="_blank" rel="noopener">
                <Icon name="whatsapp" size={28} />
                <U as="span" className="s-contacts__k" k="cta.whatsapp" />
                <span className="s-contacts__v num">+{CONTACT.whatsappLabel}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${CONTACT.email}`}>
                <Icon name="mail" size={28} />
                <span className="s-contacts__k">E-mail</span>
                <span className="s-contacts__v s-contacts__v--mail">{CONTACT.email}</span>
              </a>
            </li>
          </ul>
        </div>
      </section>

      {(intro?.paras.length || rest.length) ? (
        <section className="s-band">
          <div className="wrap s-narrow s-prose s-prose--big">
            {(intro?.paras ?? []).map((x) => <PT as="p" key={x} v={x} multiline />)}
            {rest.map((sec) => (
              <div key={sec.heading}>
                {sec.eyebrow && <PT as="p" className="s-kicker" v={sec.eyebrow} />}
                <PT as="h2" className="s-h3" v={sec.heading ?? ''} />
                {sec.paras.map((x) => <PT as="p" key={x} v={x} multiline />)}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {districts.length > 0 && (
        <section className="s-band">
          <div className="wrap s-narrow">
            <PT as="h2" className="s-h2" v={districtSec?.heading ?? ''} />
            <div className="s-prose">
              {districtSec?.paras.map((x) => <PT as="p" key={x} v={x} multiline />)}
            </div>
            <ul className="s-districts">
              {districts.map((d) => <li key={d}><PT v={d} /></li>)}
            </ul>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  )
}
