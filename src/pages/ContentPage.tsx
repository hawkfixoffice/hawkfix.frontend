import { useLoaderData } from 'react-router-dom'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Blocks from '../components/Blocks'
import { CtaBand, PageHead } from '../components/Simple'

/** Универсальная контентная страница (юридические документы).
 *  Блоки берутся из контента старого сайта как есть. */
export default function ContentPage({ narrow = false }: { narrow?: boolean }) {
  const { page, locale } = usePage()
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }

  return (
    <>
      <PageHead lead={page.tr[locale].description} />
      <section className="s-band s-band--first">
        <div className="wrap">
          <div className={narrow ? 'doc' : 'doc doc--wide'}>
            <Blocks blocks={body.blocks} editable />
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  )
}
