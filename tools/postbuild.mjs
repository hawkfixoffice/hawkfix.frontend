/**
 * Досборка dist под GitHub Pages:
 *   sitemap.xml с hreflang-альтернативами, robots.txt, 404.html,
 *   .nojekyll (иначе Pages прячет пути с подчёркиванием) и CNAME.
 */
import { readFile, writeFile, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const SITE = 'https://hawkfix.pl'
const DOMAIN = 'hawkfix.pl'
const HREFLANG = { pl: 'pl-PL', uk: 'uk-UA', ru: 'ru', en: 'en' }
const LOCALES = ['pl', 'uk', 'ru', 'en']

const index = JSON.parse(await readFile('content/index.json', 'utf8'))
const today = new Date().toISOString().slice(0, 10)

/** Приоритет: главная > услуги/цены > страницы услуг > юридические. */
const priorityOf = (t) =>
  t === 'home' ? '1.0' : t === 'services' || t === 'prices' ? '0.9'
  : t === 'service' ? '0.8' : t === 'legal' ? '0.3' : '0.6'

const urls = []
for (const page of index) {
  for (const loc of LOCALES) {
    const path = page.paths[loc]
    if (!path) continue
    const alts = LOCALES.filter((l) => page.paths[l])
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${page.paths[l]}"/>`)
      .join('\n')
    urls.push(
      `  <url>\n` +
      `    <loc>${SITE}${path}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${page.type === 'legal' ? 'yearly' : 'monthly'}</changefreq>\n` +
      `    <priority>${priorityOf(page.type)}</priority>\n` +
      alts + '\n' +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${page.paths.pl}"/>\n` +
      `  </url>`,
    )
  }
}

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
  `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  urls.join('\n') + '\n</urlset>\n'

await writeFile('dist/sitemap.xml', sitemap, 'utf8')

await writeFile('dist/robots.txt',
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8')

// GitHub Pages отдаёт 404.html из корня на любой неизвестный адрес.
// SSG кладёт его либо в dist/404/index.html, либо сразу в dist/404.html —
// готовый файл не трогаем, иначе затрём настоящую страницу копией главной.
if (existsSync('dist/404/index.html')) {
  await cp('dist/404/index.html', 'dist/404.html')
} else if (!existsSync('dist/404.html')) {
  throw new Error('404-страница не сгенерирована: проверь маршрут /404 в src/main.tsx')
}

await writeFile('dist/.nojekyll', '', 'utf8')
await writeFile('dist/CNAME', `${DOMAIN}\n`, 'utf8')

console.log(`sitemap.xml: ${urls.length} URL`)
console.log('robots.txt, 404.html, .nojekyll, CNAME — записаны')
