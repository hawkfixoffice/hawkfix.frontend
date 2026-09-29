import { useLoaderData } from 'react-router-dom'
import type { PageBody } from '../lib/types'
import { isQaList, toSections } from '../lib/sections'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Accordion from '../components/Accordion'
import Facts from '../components/Facts'
import { CtaBand, MainActions, PageHead } from '../components/Simple'
import { PT } from '../cms/E'

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
      <PageHead lead={tr.description} actions={<MainActions />} />

      <section className="s-band s-band--first">
        <div className="wrap s-split">
          <div className="s-photo">
            <Picture name="about" alt={t.alt.about} ratio="4x3" widths={[800, 1200, 1600]} sizes="(max-width:900px) 100vw, 46vw" priority />
          </div>
          <div className="s-prose s-prose--big">
            {(intro?.paras ?? []).map((x) => <PT as="p" key={x} v={x} multiline />)}
          </div>
        </div>
      </section>

      {rest.map((sec) => (
        <section className="s-band" key={sec.heading}>
          <div className="wrap s-narrow">
            {sec.eyebrow && <PT as="p" className="s-kicker" v={sec.eyebrow} />}
            <PT as="h2" className="s-h2" v={sec.heading ?? ''} />
            <div className="s-prose">
              {sec.paras.map((x) => <PT as="p" key={x} v={x} multiline />)}
            </div>
            {(sec.lists[0] ?? []).length > 0 && (
              <ul className="s-checks">
                {(sec.lists[0] ?? []).map((x) => (
                  <li key={x}><Icon name="check" size={20} /><PT v={x} multiline /></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}

      <Facts />

      {qaPairs.length > 0 && (
        <section className="s-band">
          <div className="wrap s-narrow">
            <PT as="h2" className="s-h2" v={qa?.heading ?? ''} />
            <Accordion items={qaPairs} className="s-acc" cmsKey={`page:${page.key}:qa`} />
          </div>
        </section>
      )}

      <CtaBand />
    </>
  )
}
