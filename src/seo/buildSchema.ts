import type { Locale, PageRec } from '../lib/types'
import { SITE } from '../lib/types'
import { KEY_PAGES, allPages, items, pathOf, settings } from '../data/content'
import { faq } from '../data/faq'
import { UI } from '../lib/ui'
import {
  aggregateOfferNode, breadcrumbNode, businessNode, faqNode, graph, offerCatalogNode,
  serviceListNode, serviceNode, webPageNode, websiteNode,
} from './schema'
import { keywords } from '../data/keywords'
import { services } from '../data/content'

const titleOf = (key: string, locale: Locale) =>
  allPages.find((p) => p.key === key)?.tr[locale].h1 ?? key

/** Собирает JSON-LD под тип страницы. Общие узлы (бизнес, сайт) идут везде
 *  с одним @id — Google склеивает их в одну сущность. */
export function buildSchema(page: PageRec, locale: Locale): object {
  const tr = page.tr[locale]
  const url = SITE + page.paths[locale]
  const t = UI[locale]
  const home = SITE + pathOf(KEY_PAGES.home, locale)

  const kw = keywords[page.key]?.[locale] ?? []
  const img = page.image ? `${SITE}/img/out/${page.image}-1200.webp` : undefined
  const meta = { keywords: kw, image: img }

  const nodes: object[] = [
    businessNode(locale, tr.description),
    websiteNode(locale, 'HAWK.FIX'),
  ]

  const trail = [{ name: t.breadcrumbs.home, url: home }]

  switch (page.type) {
    case 'home':
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'WebPage', meta))
      nodes.push(faqNode(faq[locale].items))
      nodes.push(offerCatalogNode(locale, titleOf(KEY_PAGES.prices, locale)))
      break

    case 'service': {
      const groupItems = page.group ? items.filter((i) => i.group === page.group) : []
      const priceFrom = groupItems.length ? Math.min(...groupItems.map((i) => i.price)) : settings.minVisit
      trail.push({ name: t.nav.services, url: SITE + pathOf(KEY_PAGES.services, locale) })
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'WebPage', meta))
      nodes.push(serviceNode({
        url, name: tr.h1, description: tr.description, locale, priceFrom,
        image: img, group: page.group,
      }))
      nodes.push(breadcrumbNode(trail))
      break
    }

    case 'prices':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'WebPage', meta))
      nodes.push(offerCatalogNode(locale, tr.h1))
      nodes.push(aggregateOfferNode(locale))
      nodes.push(breadcrumbNode(trail))
      break

    case 'about':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'AboutPage', meta))
      nodes.push(faqNode(faq[locale].items))
      nodes.push(breadcrumbNode(trail))
      break

    case 'contact':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'ContactPage', meta))
      nodes.push(breadcrumbNode(trail))
      break

    case 'services':
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'CollectionPage', meta))
      nodes.push(serviceListNode(
        services.map((s) => ({ name: s.tr[locale].h1, url: SITE + s.paths[locale] })),
        tr.h1,
      ))
      nodes.push(breadcrumbNode(trail))
      break

    default:
      trail.push({ name: tr.h1, url })
      nodes.push(webPageNode(url, tr.title, tr.description, locale, 'WebPage', meta))
      nodes.push(breadcrumbNode(trail))
  }

  return graph(nodes)
}
