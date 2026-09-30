import { Link } from 'react-router-dom'
import { KEY_PAGES, pathOf, services, settings } from '../data/content'
import { usePage } from './PageContext'
import Breadcrumbs from './Breadcrumbs'
import Icon from './Icon'
import { CONTACT } from '../lib/ui'
import E, { PT, U } from '../cms/E'
import { priceFromOf } from '../lib/facts'

/** Простая шапка страницы: хлебные крошки, крупный заголовок, одна строка
 *  пояснения и (по желанию) действия. Никаких плашек и декора. */
export function PageHead({ lead, leadField = 'lead', crumbs, actions, aside }: {
  lead: string
  leadField?: string
  crumbs?: { name: string; to: string }[]
  actions?: React.ReactNode
  aside?: React.ReactNode
}) {
  const { page, locale, t } = usePage()
  const tr = page.tr[locale]
  return (
    <section className="s-head pagehead">
      <div className="wrap">
        <Breadcrumbs trail={crumbs ?? [
          { name: t.breadcrumbs.home, to: pathOf(KEY_PAGES.home, locale) },
          { name: tr.h1, to: page.paths[locale] },
        ]} />
        <div className={aside ? 's-head__grid' : undefined}>
          <div>
            <PT as="h1" className="s-h1" field="h1" v={tr.h1} />
            {lead && <PT as="p" className="s-lead" field={leadField} v={lead} multiline />}
            {actions && <div className="s-actions">{actions}</div>}
          </div>
          {aside}
        </div>
      </div>
    </section>
  )
}

/** Кнопки «посчитать цену» и «WhatsApp» — одинаковые на всех страницах. */
export function MainActions() {
  const { locale } = usePage()
  return (
    <>
      <Link className="btn btn--primary btn--lg" to={`${pathOf(KEY_PAGES.home, locale)}#wycena`}>
        <U k="cta.quote" /> <Icon name="arrow" size={18} />
      </Link>
      <a className="btn btn--ghost btn--lg" href={CONTACT.whatsappHref} target="_blank" rel="noopener">
        <Icon name="whatsapp" size={17} /> <U k="simple.write" />
      </a>
    </>
  )
}

/** Список услуг строками: название, одна фраза, цена «от» и стрелка. */
export function ServiceRows({ list = services, blurbs = true, heading = 'h3' }: {
  list?: typeof services; blurbs?: boolean; heading?: 'h2' | 'h3'
}) {
  const { locale, t } = usePage()
  return (
    <ul className="s-rows">
      {list.map((s) => (
        <li key={s.key}>
          <Link className="s-row" to={s.paths[locale]}>
            <div className="s-row__main">
              <E as={heading} className="s-row__t" k={`page:${s.key}:h1`} v={s.tr[locale].h1} />
              {blurbs && s.tr[locale].blurb && (
                <E as="span" className="s-row__d" k={`page:${s.key}:blurb`} v={s.tr[locale].blurb} />
              )}
            </div>
            <span className="s-row__p num">{t.simple.from} {priceFromOf(s)} {settings.currency}</span>
            <Icon name="arrowUpRight" size={24} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Заключительный призыв — одна фраза, одна строка кнопок. */
export function CtaBand() {
  return (
    <section className="s-band s-cta">
      <div className="wrap">
        <U as="h2" className="s-h2" k="home.ctaHead" />
        <U as="p" className="s-lead" k="home.ctaLead" multiline />
        <div className="s-actions"><MainActions /></div>
      </div>
    </section>
  )
}
