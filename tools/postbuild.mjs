/**
 * Досборка dist под GitHub Pages:
 *   sitemap.xml с hreflang-альтернативами, robots.txt, 404.html,
 *   .nojekyll (иначе Pages прячет пути с подчёркиванием) и CNAME.
 */
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const SITE = 'https://hawkfix.pl'
const DOMAIN = 'hawkfix.pl'
const HREFLANG = { pl: 'pl-PL', uk: 'uk-UA', ru: 'ru', en: 'en' }
const LOCALES = ['pl', 'uk', 'ru', 'en']

const index = JSON.parse(await readFile('content/index.json', 'utf8'))
const photos = JSON.parse(await readFile('content/photos.json', 'utf8'))
const today = new Date().toISOString().slice(0, 10)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
    // Картинка страницы — в sitemap: даёт шанс попасть в поиск по картинкам
    const img = page.image
      ? `    <image:image>\n` +
        `      <image:loc>${SITE}/img/out/${page.image}-1200.webp</image:loc>\n` +
        `      <image:title>${esc(page.tr[loc].h1)}</image:title>\n` +
        `    </image:image>\n`
      : ''
    urls.push(
      `  <url>\n` +
      `    <loc>${SITE}${path}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${page.type === 'legal' ? 'yearly' : 'monthly'}</changefreq>\n` +
      `    <priority>${priorityOf(page.type)}</priority>\n` +
      alts + '\n' +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${page.paths.pl}"/>\n` +
      img +
      `  </url>`,
    )
  }
}

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
  `        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n` +
  `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  urls.join('\n') + '\n</urlset>\n'

await writeFile('dist/sitemap.xml', sitemap, 'utf8')

await writeFile('dist/robots.txt', [
  '# https://hawkfix.pl — robots.txt',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  '# Служебные файлы генератора и страница 404 — не для индекса.',
  '# CSS и JS намеренно открыты: без них Google не отрендерит страницу.',
  'Disallow: /404',
  'Disallow: /static-loader-data/',
  '',
  '# Ассистенты пускаем: для локального сервиса упоминание в их ответах полезно.',
  '# Чтобы закрыть — заменить Allow на Disallow в блоках ниже.',
  'User-agent: GPTBot',
  'Allow: /',
  '',
  'User-agent: ClaudeBot',
  'Allow: /',
  '',
  'User-agent: PerplexityBot',
  'Allow: /',
  '',
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
].join('\n'), 'utf8')

// --- llms.txt: краткая карта сайта для языковых моделей ---
const svc = index.filter((p) => p.type === 'service')
await writeFile('dist/llms.txt', [
  '# HAWK.FIX',
  '',
  `> ${index.find((p) => p.type === 'home').tr.pl.description}`,
  '',
  'Złota rączka w Warszawie i 25 km wokół. Hydraulika, elektryka, meble i AGD,',
  'ściany, sprzątanie, przeprowadzki, ogród. Klient sam składa kosztorys na',
  'stronie i od razu widzi cenę oraz czas. Minimalna wizyta 246 zł.',
  'Strona w czterech językach: pl (domyślny), uk, ru, en.',
  '',
  '## Główne strony',
  // Подписи задаём явно: h1 главной — это вопрос калькулятора,
  // названием страницы он не является.
  ...[['home', 'Strona główna'], ['uslugi', 'Usługi'], ['cennik', 'Cennik'],
      ['o-nas', 'O nas'], ['kontakt', 'Kontakt']].map(([k, label]) => {
    const p = index.find((x) => x.key === k)
    return p ? `- [${label}](${SITE}${p.paths.pl}): ${p.tr.pl.description}` : ''
  }).filter(Boolean),
  '',
  '## Usługi',
  ...svc.map((p) => `- [${p.tr.pl.h1}](${SITE}${p.paths.pl}): ${p.tr.pl.blurb ?? ''}`),
  '',
  '## Kontakt',
  '- Telefon: +48 532 481 505',
  '- WhatsApp: +48 735 369 350',
  '- E-mail: hawk.fix.office@gmail.com',
  '',
].join('\n'), 'utf8')

// --- manifest: иконка и цвет при добавлении на домашний экран ---
await writeFile('dist/manifest.webmanifest', JSON.stringify({
  name: 'HAWK.FIX — złota rączka w Warszawie',
  short_name: 'HAWK.FIX',
  description: index.find((p) => p.type === 'home').tr.pl.description,
  lang: 'pl-PL',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#111312',
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/favicon-96.png', sizes: '96x96', type: 'image/png' },
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  ],
}, null, 1), 'utf8')

// --- security.txt: куда писать о найденной уязвимости (RFC 9116) ---
const expires = new Date(Date.now() + 365 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z')
await mkdir('dist/.well-known', { recursive: true })
const security = [
  'Contact: mailto:hawk.fix.office@gmail.com',
  `Expires: ${expires}`,
  'Preferred-Languages: pl, uk, ru, en',
  `Canonical: ${SITE}/.well-known/security.txt`,
  '',
].join('\n')
await writeFile('dist/.well-known/security.txt', security, 'utf8')
await writeFile('dist/security.txt', security, 'utf8')

// --- humans.txt ---
await writeFile('dist/humans.txt', [
  '/* TEAM */',
  'HAWK.FIX — własna ekipa, nie call center.',
  'Kontakt: hawk.fix.office@gmail.com',
  'Lokalizacja: Warszawa, Polska',
  '',
  '/* SITE */',
  `Ostatnia aktualizacja: ${today}`,
  'Języki: polski, українська, русский, English',
  'Standardy: HTML5, CSS3, statyczne generowanie stron',
  'Technologie: React, Vite, Supabase',
  '',
].join('\n'), 'utf8')

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

const withImg = urls.filter((u) => u.includes('<image:image>')).length
console.log(`sitemap.xml: ${urls.length} URL, из них с картинкой ${withImg}`)
console.log('robots.txt, llms.txt, manifest.webmanifest, security.txt, humans.txt, 404.html, .nojekyll, CNAME — записаны')
