import { Link, useLoaderData } from 'react-router-dom'
import { KEY_PAGES, pathOf } from '../data/content'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import Rule from '../components/Rule'
import Blocks from '../components/Blocks'
import Breadcrumbs from '../components/Breadcrumbs'
import Icon from '../components/Icon'
import { CONTACT } from '../lib/ui'
import { PT, U } from '../cms/E'

/** Универсальная контентная страница: о нас, контакты, юридические.
 *  Блоки берутся из контента старого сайта как есть. */
export default function ContentPage({ narrow = false }: { narrow?: boolean }) {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  const body = (useLoaderData() as PageBody | undefined) ?? { blocks: [] }

  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <Breadcrumbs trail={[
            { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
            { name: tr.h1, to: page.paths[locale] },
          ]} />
          <PT as="h1" field="h1" v={tr.h1} />
          <PT as="p" className="pagehead__lead prose" field="lead" v={tr.description} multiline />
          <Rule className="pagehead__rule" />
        </div>
      </section>

      <section className="band band--tight">
        <div className="wrap">
          <div className={narrow ? 'doc' : 'doc doc--wide'}>
            <Blocks blocks={body.blocks} editable />
          </div>
        </div>
      </section>

      <section className="band band--tight ctaband">
        <div className="wrap ctaband__in">
          <div>
            <U as="h2" k="home.ctaHead" />
            <U as="p" className="prose" k="home.ctaLead" multiline />
          </div>
          <div className="ctaband__actions">
            <Link className="btn btn--primary" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
              <U k="cta.quote" /> <Icon name="arrow" size={17} />
            </Link>
            <a className="btn btn--ghost" href={CONTACT.phoneHref}>
              <Icon name="phone" size={16} /> {CONTACT.phone}
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
