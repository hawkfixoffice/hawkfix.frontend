/**
 * Рисует og-картинки 1200×630 — по одной на язык.
 *
 * Картинка повторяет герой сайта: тёмный холст, светлый (400) заголовок Manrope,
 * контурная плашка города, три чёрно-белых фото в скруглённых панелях и нижняя
 * строка с фактами. Цифры берём из контента, а не вписываем руками, — прайс
 * меняется, картинка не должна врать.
 *
 * Формат — PNG: WebP в превью мессенджеров и соцсетей не гарантирован
 * (это единственное исключение из правила «вся растровая графика в WebP»).
 */
import puppeteer from 'puppeteer'
import { readFile, mkdir } from 'node:fs/promises'

const items = JSON.parse(await readFile('content/items.json', 'utf8'))
const services = JSON.parse(await readFile('content/services.json', 'utf8'))
const settings = JSON.parse(await readFile('content/settings.json', 'utf8'))
const N_ITEMS = items.length
const N_SERVICES = services.length
const MIN = `${settings.minVisit} ${settings.currency}`

// Заголовок — тот же, что в герое: ссылка и превью должны говорить одно и то же.
const TAGLINE = {
  pl: 'Naprawy domowe\nzamówisz w minutę —\ncenę znasz z góry.',
  uk: 'Домашній ремонт\nзамовите за хвилину —\nціну знаєте наперед.',
  ru: 'Домашний ремонт\nзакажете за минуту —\nцену знаете заранее.',
  en: 'Home repairs booked\nin a minute — price\nknown upfront.',
}
const KICKER = {
  pl: 'Warszawa i 25 km wokół',
  uk: 'Варшава і 25 км навколо',
  ru: 'Варшава и 25 км вокруг',
  en: 'Warsaw and 25 km around',
}
const FACTS = {
  pl: `${N_ITEMS} pozycji z cenami · minimum ${MIN} · ${N_SERVICES} usług`,
  uk: `${N_ITEMS} позицій із цінами · мінімум ${MIN} · ${N_SERVICES} послуг`,
  ru: `${N_ITEMS} позиций с ценами · минимум ${MIN} · ${N_SERVICES} услуг`,
  en: `${N_ITEMS} priced items · minimum ${MIN} · ${N_SERVICES} services`,
}

// Шрифты вшиваем как data: — headless-браузер не ходит в dev-сервер.
// Нужны все сабсеты: латиница, польские диакритики (ł, ą, ę) и кириллица.
// С одним сабсетом браузер считает, что шрифт покрывает всё, глифов не находит
// и молча падает на засечный.
const font = async (f) => (await readFile(`public/fonts/${f}`)).toString('base64')
const [latin, latinExt, cyr, cyrExt] = await Promise.all([
  font('manrope-latin.woff2'), font('manrope-latin-ext.woff2'),
  font('manrope-cyrillic.woff2'), font('manrope-cyrillic-ext.woff2'),
])
const R = {
  lat: 'U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122',
  latX: 'U+0100-02BA, U+1E00-1E9F, U+2020, U+20A0-20AB, U+2C60-2C7F',
  cyr: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  cyrX: 'U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F',
}

const photo = async (name) =>
  `data:image/webp;base64,${(await readFile(`public/img/out/${name}-800.webp`)).toString('base64')}`
// три светлых кадра: сантехника, ремонт, электрика — вместе читаются как
// разброс услуг. Тёмные кадры в узкой панели превращаются в чёрную полосу.
const PANELS = await Promise.all(['plumbing', 'renovation', 'about'].map(photo))

// Звёздочка логотипа: шесть лучей, тот же знак, что в фавиконе и в Lottie
const STAR = `<svg viewBox="0 0 24 24" fill="none" stroke="#6eefa0" stroke-width="3" stroke-linecap="round">
  <path d="M4 12h16"/><path d="M8 4l8 16"/><path d="M16 4L8 20"/></svg>`

const html = (loc) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${latin}) format('woff2');font-weight:200 800;unicode-range:${R.lat}}
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${latinExt}) format('woff2');font-weight:200 800;unicode-range:${R.latX}}
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${cyr}) format('woff2');font-weight:200 800;unicode-range:${R.cyr}}
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${cyrExt}) format('woff2');font-weight:200 800;unicode-range:${R.cyrX}}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#111312;color:#fff;font-family:Manrope,sans-serif;
     font-feature-settings:'tnum' 1;overflow:hidden;display:flex}
.left{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:56px 0 56px 68px}
.brand{display:flex;align-items:center;gap:6px;font-size:29px;font-weight:600;letter-spacing:-.025em}
.brand svg{width:.52em;height:.52em;margin:0 .04em;transform:translateY(.12em)}
.kicker{display:inline-flex;align-self:flex-start;padding:10px 20px;border:1px solid rgba(255,255,255,.42);
        border-radius:999px;font-size:17px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}
h1{font-size:63px;font-weight:400;line-height:1.0;letter-spacing:-.035em;white-space:pre-line;margin-top:22px}
.bar{display:flex;align-items:center;gap:12px}
.pill{border-radius:999px;padding:12px 22px;font-size:18px;white-space:nowrap}
.pill--url{background:#6eefa0;color:#111312;font-weight:600}
.pill--facts{border:1px solid rgba(255,255,255,.28);color:#c9cdc9}
.panels{display:flex;gap:16px;padding:56px 68px 56px 40px}
.panel{width:132px;border-radius:26px;overflow:hidden;position:relative;background:#1b1d1c}
.panel img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.04)}
.panel--tall{align-self:stretch}
.panel--mid{margin-top:30px}
.panel--last{margin-top:60px}
</style></head><body>
<div class="left">
  <div class="brand">HAWK${STAR}FIX</div>
  <div>
    <span class="kicker">${KICKER[loc]}</span>
    <h1>${TAGLINE[loc]}</h1>
  </div>
  <div class="bar">
    <span class="pill pill--url">hawkfix.pl</span>
    <span class="pill pill--facts">${FACTS[loc]}</span>
  </div>
</div>
<div class="panels">
  <div class="panel panel--tall"><img src="${PANELS[0]}" alt=""></div>
  <div class="panel panel--mid"><img src="${PANELS[1]}" alt=""></div>
  <div class="panel panel--last"><img src="${PANELS[2]}" alt=""></div>
</div>
</body></html>`

await mkdir('public/og', { recursive: true })
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
for (const loc of Object.keys(TAGLINE)) {
  await page.setContent(html(loc), { waitUntil: 'domcontentloaded' })
  // networkidle тут не наступает: всё вшито в data:, сети нет вовсе.
  // Ждём именно шрифты и декодирование картинок.
  await page.evaluate(() => Promise.all([
    document.fonts.ready,
    ...[...document.images].map((i) => (i.complete ? i.decode() : new Promise((r) => { i.onload = i.onerror = r }))),
  ]))
  // Переносы в заголовке расставлены руками. Подбираем кегль так, чтобы самая
  // длинная строка влезла в колонку и браузер не переносил её сам: иначе
  // в украинском (он длиннее польского) на отдельной строке повисало тире.
  // Меряем в режиме `pre` — там перенос запрещён и scrollWidth равен ширине
  // самой длинной строки.
  const fitted = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const avail = h1.parentElement.getBoundingClientRect().width
    const base = parseFloat(getComputedStyle(h1).fontSize)
    h1.style.whiteSpace = 'pre'
    h1.style.width = 'max-content'
    const widest = h1.scrollWidth
    h1.style.whiteSpace = ''
    h1.style.width = ''
    const px = Math.min(base, Math.floor(base * (avail / widest) * 100) / 100)
    h1.style.fontSize = px + 'px'
    return Math.round(px * 10) / 10
  })
  await page.screenshot({ path: `public/og/og-${loc}.png` })
  console.log(`  og-${loc}.png  заголовок ${fitted}px`)
}
await browser.close()
