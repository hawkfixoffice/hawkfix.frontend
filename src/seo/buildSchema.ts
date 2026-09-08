import type { Locale, PageRec } from '../lib/types'
import { SITE } from '../lib/types'
import { KEY_PAGES, allPages, items, pathOf, settings } from '../data/content'
import { faq } from '../data/faq'
import { UI } from '../lib/ui'
import {
  breadcrumbNode, businessNode, faqNode, graph, offerCatalogNode,
  serviceNode, webPageNode, websiteNode,
} from './schema'

const titleOf = (key: string, locale: Locale) =>
  allPages.find((p) => p.key === key)?.tr[locale].h1 ?? key

/** Собирает JSON-LD под тип страницы. Общие узлы (бизнес, сайт) идут везде
 *  с одним @id — Google склеивает их в одну сущность. */
export function buildSchema(page: PageRec, locale: Locale): object {
  const tr = page.tr[locale]
  const url = SITE + page.paths[locale]
  const t = UI[locale]
  const home = SITE + pathOf(KEY_PAGES.home, locale)

  const nodes: object[] = [
    businessNode(locale, tr.description),
    websiteNode(locale, 'HAWK.FIX'),
  ]

  const trail = [{ name: t.breadcrumbs.home, url: home }]

  switch (page.type) {
    case 'home':
      nodes.push(webPageNode(url, tr.title, tr.description, locale))
      nodes.push(faqNode(faq[locale].items))
      nodes.push(offerCatalogNode(locale, titleOf(KEY_PAGES.prices, locale)))
      break

    case 'service': {
      const groupItems = page.group ? items.filter((i) => i.group === page.group) : []
      const priceFrom = groupItems.length ? Math.min(...groupItems.map((i) => i.price)) : settings.minVisit
      trail.push({ name: t.nav.services, url: SITE + pathOf(KEY_PAGES.services, locale) })
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale))
      nodes.push(serviceNode({
        url, name: tr.h1, description: tr.description, locale, priceFrom,
        image: page.image ? `${SITE}/img/out/${page.image}-1200.jpg` : undefined,
      }))
      nodes.push(breadcrumbNode(trail))
      break
    }

    case 'prices':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale))
      nodes.push(offerCatalogNode(locale, tr.h1))
      nodes.push(breadcrumbNode(trail))
      break

    case 'about':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'AboutPage'))
      nodes.push(faqNode(faq[locale].items))
      nodes.push(breadcrumbNode(trail))
      break

    case 'contact':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'ContactPage'))
      nodes.push(breadcrumbNode(trail))
      break

    default:
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale))
      nodes.push(breadcrumbNode(trail))
  }

  return graph(nodes)
}
