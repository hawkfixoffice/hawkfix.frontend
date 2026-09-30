/**
 * Досборка dist под GitHub Pages:
 *   sitemap.xml с hreflang-альтернативами, robots.txt, 404.html,
 *   .nojekyll (иначе Pages прячет пути с подчёркиванием) и CNAME.
 */
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

// Адрес сборки задаётся тем же VITE_SITE, что и в src/lib/types.ts, — иначе
// sitemap, robots и CNAME разъедутся с canonical и og внутри страниц.
const PROD_SITE = 'https://hawkfix.pl'
const SITE = (() => {
  const raw = process.env.VITE_SITE
  if (!raw) return PROD_SITE
  try {
    const u = new URL(raw)
    // Адрес с путём (user.github.io/repo) не годится: ссылки у нас от корня
    return u.pathname === '/' ? u.origin : PROD_SITE
  } catch { return PROD_SITE }
})()
const DOMAIN = new URL(SITE).host
const IS_STAGING = SITE !== PROD_SITE
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

// Витрину для проверки закрываем целиком: одинаковый контент на двух адресах
// уводит позиции с боевого домена. На проде — обычный открытый robots.
//
// Боты ассистентов перечислены в ОДНОЙ группе со звёздочкой. Раньше у каждого
// была своя группа только с `Allow: /` — а бот с собственной группой правила
// `*` не читает, то есть GPTBot и компания видели /panel/ и /404. Теперь
// правила одни для всех, а список имён — явное «добро пожаловать».
const AI_BOTS = [
  // OpenAI: обучение, поиск ChatGPT, переходы по ссылке из чата
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  // Anthropic
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  // Perplexity, Google (Gemini / AI Overviews), Apple, Microsoft, Meta, Amazon…
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended',
  'Bingbot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User', 'CCBot',
]
await writeFile('dist/robots.txt', IS_STAGING ? [
  `# ${SITE} — витрина для проверки, не для индекса`,
  '',
  'User-agent: *',
  'Disallow: /',
  '',
].join('\n') : [
  `# ${SITE} — robots.txt`,
  '# Поисковики и ассистенты — добро пожаловать: для локального сервиса',
  '# упоминание в ответах ChatGPT, Claude, Perplexity и Gemini — это клиенты.',
  '',
  'User-agent: *',
  ...AI_BOTS.map((b) => `User-agent: ${b}`),
  'Allow: /',
  '# Служебные файлы генератора и страница 404 — не для индекса.',
  '# CSS и JS намеренно открыты: без них Google не отрендерит страницу.',
  'Disallow: /404',
  'Disallow: /static-loader-data/',
  '# Панель управления — служебная часть, в поиске ей делать нечего.',
  'Disallow: /panel/',
  '',
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
].join('\n'), 'utf8')

// --- IndexNow: мгновенное уведомление Bing, Яндекса, Seznam и Naver ---
// Поиск ChatGPT и Copilot стоят на индексе Bing, поэтому свежесть там важна.
// Ключ публичный по протоколу: файл с ним доказывает, что сайт наш.
// Пинг после деплоя — tools/indexnow.mjs (шаг в .github/workflows/deploy.yml).
const INDEXNOW_KEY = 'aa7c2d65e76f5aec83eb114e32c55cdc'
if (!IS_STAGING) await writeFile(`dist/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY, 'utf8')

// --- llms.txt и llms-full.txt: сайт в виде простого текста для языковых моделей ---
// llms.txt — карта (что это, главные страницы на 4 языках, услуги с ценой «от»).
// llms-full.txt — всё, что нужно, чтобы ответить на вопрос клиента без
// открытия страниц: факты, каждая услуга с описанием, полный прайс, вопросы.
// Числа берутся из прайса и настроек, как на самих страницах.
const items = JSON.parse(await readFile('content/items.json', 'utf8'))
const groups = JSON.parse(await readFile('content/groups.json', 'utf8'))
const settings = JSON.parse(await readFile('content/settings.json', 'utf8'))
const faqAll = JSON.parse(await readFile('content/faq.json', 'utf8'))
const svc = index.filter((p) => p.type === 'service')
const priced = (list) => list.map((i) => i.price).filter((x) => x > 0)
const fromOf = (p) => {
  const pr = priced(items.filter((i) => i.group && i.group === p.group))
  return pr.length ? Math.min(...pr) : settings.minVisit
}
const bodyOf = async (key, loc) => {
  try { return JSON.parse(await readFile(`content/bodies/${key}__${loc}.json`, 'utf8')) } catch { return {} }
}
const byKey = (k) => index.find((x) => x.key === k)
const cur = settings.currency

const L = {
  pl: {
    lang: 'Polski', home: 'Strona główna', svcs: 'Usługi', prices: 'Cennik', about: 'O nas', contact: 'Kontakt',
    from: 'od', photo: 'wycena po zdjęciu',
    summary: [
      `HAWK.FIX to złota rączka (mąż na godzinę) w Warszawie i do ${25} km wokół.`,
      'Jeden fachowiec albo cała ekipa: hydraulik, elektryk, montaż mebli i AGD, ściany i malowanie,',
      'drobne naprawy, sprzątanie, przeprowadzki, ogród.',
      `Klient sam składa kosztorys na stronie i od razu widzi cenę. Minimalna wizyta ${settings.minVisit} ${cur}.`,
      `Cennik: ${items.length} pozycji z cenami. Przyjazd dziś lub jutro: +${settings.urgentPct}%, najwyżej +${settings.urgentMax} ${cur}.`,
      'Godziny: poniedziałek–piątek 08:00–20:00. Języki obsługi: polski, ukraiński, rosyjski, angielski.',
    ],
    facts: 'Najważniejsze fakty', list: 'Pełny cennik', faq: 'Częste pytania', contactH: 'Kontakt',
    included: 'Co wchodzi',
  },
  en: {
    lang: 'English', home: 'Home', svcs: 'Services', prices: 'Prices', about: 'About', contact: 'Contact',
    from: 'from', photo: 'quoted from a photo',
    summary: [
      'HAWK.FIX is a handyman service (złota rączka) in Warsaw, Poland, and up to 25 km around.',
      'One handyman or a whole crew: plumber, electrician, furniture and appliance assembly, walls and painting,',
      'small repairs, cleaning, moving, garden work.',
      `Customers build the estimate on the website and see the price right away. Minimum visit ${settings.minVisit} ${cur} (PLN).`,
      `Price list: ${items.length} items with prices. Visit today or tomorrow: +${settings.urgentPct}%, at most +${settings.urgentMax} ${cur}.`,
      'Hours: Monday–Friday 08:00–20:00. Languages: Polish, Ukrainian, Russian, English.',
    ],
    facts: 'Key facts', list: 'Full price list', faq: 'Frequently asked questions', contactH: 'Contact',
    included: 'Included',
  },
}
const CONTACT_LINES = [
  '- WhatsApp: +48 735 369 350 (calls Mon–Fri 9:00–17:00, messages any time / dzwonić pn–pt 9:00–17:00, pisać o każdej porze)',
  '- E-mail: hawk.fix.office@gmail.com',
  `- ${SITE}/`,
]

// llms.txt — карта
await writeFile('dist/llms.txt', [
  '# HAWK.FIX',
  '',
  `> ${L.pl.summary.join(' ')}`,
  '',
  ...L.en.summary,
  '',
  `Pełny tekst dla modeli językowych / full text for LLMs: ${SITE}/llms-full.txt`,
  '',
  ...['pl', 'uk', 'ru', 'en'].flatMap((loc) => [
    `## ${loc.toUpperCase()}`,
    // Подписи задаём явно: h1 главной — это вопрос калькулятора, а не название
    ...['home', 'uslugi', 'cennik', 'o-nas', 'kontakt'].map((k) => {
      const p = byKey(k)
      if (!p?.paths[loc]) return ''
      const label = k === 'home' ? 'HAWK.FIX' : p.tr[loc].h1
      return `- [${label}](${SITE}${p.paths[loc]}): ${p.tr[loc].description}`
    }).filter(Boolean),
    '',
  ]),
  '## Usługi / Services',
  ...svc.map((p) => `- [${p.tr.pl.h1}](${SITE}${p.paths.pl}) / [${p.tr.en.h1}](${SITE}${p.paths.en}): ${L.pl.from} ${fromOf(p)} ${cur}. ${p.tr.pl.blurb ?? ''}`),
  '',
  '## Kontakt / Contact',
  ...CONTACT_LINES,
  '',
].join('\n'), 'utf8')

// llms-full.txt — полный текст на польском и английском
const full = []
for (const loc of ['pl', 'en']) {
  const t = L[loc]
  full.push(`# HAWK.FIX — ${t.lang}`, '', ...t.summary, '')
  full.push(`## ${t.svcs}`, '')
  for (const p of svc) {
    const b = await bodyOf(p.key, loc)
    full.push(`### ${p.tr[loc].h1}`, `${SITE}${p.paths[loc]}`, '')
    full.push(`${t.from} ${fromOf(p)} ${cur}. ${p.tr[loc].description}`)
    for (const x of b.intro ?? []) full.push('', x)
    if (b.checklist?.length) full.push('', `${t.included}:`, ...b.checklist.map((x) => `- ${x}`))
    full.push('')
  }
  full.push(`## ${t.list}`, `${SITE}${byKey('cennik').paths[loc]}`, '')
  for (const g of groups) {
    const list = items.filter((i) => i.group === g.key)
    if (!list.length) continue
    full.push(`### ${g.name[loc] ?? g.name.pl}`)
    for (const i of list) {
      const unit = settings.units[loc]?.[i.unit] ?? i.unit
      const price = i.ptype === 'scope'
        ? (i.price > 0 ? `${t.from} ${i.price} ${cur}` : t.photo)
        : `${i.price} ${cur}`
      full.push(`- ${i.name[loc] || i.name.pl}: ${price} / ${unit}`)
    }
    full.push('')
  }
  const f = faqAll[loc]
  if (f?.items?.length) {
    full.push(`## ${t.faq}`, '')
    for (const x of f.items) full.push(`### ${x.q}`, x.a, '')
  }
  full.push(`## ${t.contactH}`, ...CONTACT_LINES, '', '---', '')
}
await writeFile('dist/llms-full.txt', full.join('\n'), 'utf8')

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
console.log(`адрес сборки: ${SITE}${IS_STAGING ? '  (витрина: noindex + Disallow: /)' : ''}`)
console.log(`sitemap.xml: ${urls.length} URL, из них с картинкой ${withImg}`)
console.log('robots.txt, llms.txt, llms-full.txt, IndexNow-ключ, manifest.webmanifest, security.txt, humans.txt, 404.html, .nojekyll, CNAME — записаны')
