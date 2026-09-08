import { Head } from 'vite-react-ssg'
import { HREFLANG, IS_STAGING, OG_LOCALE, SITE, type Locale, LOCALES } from '../lib/types'
import type { PageRec } from '../lib/types'
import { keywords } from '../data/keywords'

interface Props {
  page: PageRec
  locale: Locale
  /** JSON-LD @graph целиком */
  schema?: object
  /** Переопределения, если страница хочет свои title/description */
  title?: string
  description?: string
  ogImage?: string
}

/**
 * Полная SEO-голова страницы. Планка задана старым сайтом и её нельзя ронять:
 * уникальные title/description, canonical == фактический URL,
 * пять взаимных hreflang (4 языка + x-default), Open Graph и JSON-LD.
 */
export default function Seo({ page, locale, schema, title, description, ogImage }: Props) {
  const tr = page.tr[locale]
  const url = SITE + page.paths[locale]
  const t = title ?? tr.title
  const d = description ?? tr.description
  const img = SITE + (ogImage ?? `/og/og-${locale}.png`)
  const kw = keywords[page.key]?.[locale] ?? []

  return (
    <Head>
      <html lang={HREFLANG[locale]} />
      <title>{t}</title>
      <meta name="description" content={d} />
      <link rel="canonical" href={url} />

      {LOCALES.filter((l) => page.paths[l]).map((l) => (
        <link key={l} rel="alternate" hrefLang={HREFLANG[l]} href={SITE + page.paths[l]} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={SITE + page.paths.pl} />

      {/* Витрину для проверки в индекс не пускаем: тот же контент на двух
          адресах — дубль, который отбирает позиции у боевого домена. */}
      <meta
        name="robots"
        content={IS_STAGING
          ? 'noindex, nofollow'
          : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}
      />
      {/* Google этот тег игнорирует с 2009-го; держим для Яндекса и внутренней
          навигации по семантике. Настоящая работа с запросами — в title,
          description, заголовках, alt и schema.org keywords. */}
      {kw.length > 0 && <meta name="keywords" content={kw.join(', ')} />}
      <meta name="author" content="HAWK.FIX" />
      <meta name="theme-color" content="#111312" />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="HAWK.FIX" />
      <meta property="og:locale" content={OG_LOCALE[locale]} />
      {LOCALES.filter((l) => l !== locale && page.paths[l]).map((l) => (
        <meta key={l} property="og:locale:alternate" content={OG_LOCALE[l]} />
      ))}
      <meta property="og:title" content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:url" content={url} />
      {/* Полный набор: часть мессенджеров (WhatsApp, Telegram) не рисует превью,
          если нет размеров и типа, а Slack и LinkedIn спрашивают secure_url. */}
      <meta property="og:image" content={img} />
      <meta property="og:image:secure_url" content={img} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={t} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={t} />
      <meta name="twitter:description" content={d} />
      <meta name="twitter:image" content={img} />
      <meta name="twitter:image:alt" content={t} />

      <link rel="manifest" href="/manifest.webmanifest" />

      {schema ? (
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      ) : null}
    </Head>
  )
}
