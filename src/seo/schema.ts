import { CONTACT } from '../lib/ui'
import { HREFLANG, SITE, type Locale } from '../lib/types'
import { items, settings } from '../data/content'

const BUSINESS_ID = `${SITE}/#business`
const WEBSITE_ID = `${SITE}/#website`

const DISTRICTS = [
  'Śródmieście', 'Mokotów', 'Wola', 'Żoliborz', 'Ochota', 'Praga-Południe',
  'Praga-Północ', 'Bielany', 'Ursynów', 'Bemowo', 'Targówek', 'Białołęka',
]

const minPrice = Math.min(...items.map((i) => i.price))
const maxPrice = Math.max(...items.map((i) => i.price))

/** Организация + локальный бизнес. Один и тот же @id на всех страницах —
 *  так Google склеивает сущность, а не плодит дубли. */
export function businessNode(locale: Locale, description: string) {
  return {
    '@type': ['HomeAndConstructionBusiness', 'LocalBusiness'],
    '@id': BUSINESS_ID,
    name: 'HAWK.FIX',
    description,
    url: `${SITE}/`,
    telephone: CONTACT.phone,
    email: CONTACT.email,
    image: `${SITE}/img/out/hero-1200.jpg`,
    logo: `${SITE}/favicon.svg`,
    priceRange: `${minPrice}–${maxPrice} PLN`,
    currenciesAccepted: 'PLN',
    paymentAccepted: 'Cash, Invoice, Bank transfer',
    knowsLanguage: Object.keys(HREFLANG),
    inLanguage: HREFLANG[locale],
    sameAs: [CONTACT.facebook],
    address: { '@type': 'PostalAddress', addressLocality: 'Warszawa', addressCountry: 'PL' },
    geo: { '@type': 'GeoCoordinates', latitude: 52.2297, longitude: 21.0122 },
    areaServed: [
      { '@type': 'City', name: 'Warszawa' },
      ...DISTRICTS.map((name) => ({ '@type': 'AdministrativeArea', name })),
      {
        '@type': 'GeoCircle',
        geoMidpoint: { '@type': 'GeoCoordinates', latitude: 52.2297, longitude: 21.0122 },
        geoRadius: CONTACT.radiusKm * 1000,
      },
    ],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:00', closes: '20:00',
    }],
  }
}

export function websiteNode(locale: Locale, name: string) {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE}/`,
    name,
    inLanguage: HREFLANG[locale],
    publisher: { '@id': BUSINESS_ID },
  }
}

export function webPageNode(url: string, title: string, description: string, locale: Locale, type = 'WebPage') {
  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: HREFLANG[locale],
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': BUSINESS_ID },
  }
}

export function breadcrumbNode(trail: { name: string; url: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: t.url,
    })),
  }
}

/** Услуга с офертой. priceSpecification даёт шанс на расширенный сниппет с ценой. */
export function serviceNode(opts: {
  url: string; name: string; description: string; locale: Locale
  priceFrom: number; image?: string
}) {
  return {
    '@type': 'Service',
    '@id': `${opts.url}#service`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    serviceType: opts.name,
    provider: { '@id': BUSINESS_ID },
    areaServed: { '@type': 'City', name: 'Warszawa' },
    ...(opts.image ? { image: opts.image } : {}),
    offers: {
      '@type': 'Offer',
      url: opts.url,
      priceCurrency: 'PLN',
      priceSpecification: {
        '@type': 'PriceSpecification',
        minPrice: opts.priceFrom,
        priceCurrency: 'PLN',
        valueAddedTaxIncluded: true,
      },
      availability: 'https://schema.org/InStock',
    },
  }
}

export function offerCatalogNode(locale: Locale, name: string) {
  return {
    '@type': 'OfferCatalog',
    '@id': `${SITE}/#catalog`,
    name,
    inLanguage: HREFLANG[locale],
    itemListElement: items.map((it) => ({
      '@type': 'Offer',
      name: it.name[locale],
      priceCurrency: 'PLN',
      price: it.price,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: it.price,
        priceCurrency: 'PLN',
        unitText: settings.units[locale]?.[it.unit] ?? it.unit,
      },
    })),
  }
}

export function faqNode(faqs: { q: string; a: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function graph(nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
