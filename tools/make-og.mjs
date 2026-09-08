/**
 * Рисует og-картинки 1200×630 под новый бренд — по одной на язык.
 * Раньше сайт отдавал og со старым дизайном.
 */
import puppeteer from 'puppeteer'
import { readFile, mkdir } from 'node:fs/promises'

const TAGLINE = {
  pl: 'Złota rączka w Warszawie.\nCenę znasz z góry.',
  uk: 'Майстер у Варшаві.\nЦіну знаєте наперед.',
  ru: 'Мастер в Варшаве.\nЦену знаете заранее.',
  en: 'A handyman in Warsaw.\nThe price up front.',
}
const SUB = {
  pl: '105 pozycji z cenami · minimum 246 zł · Warszawa i 25 km',
  uk: '105 позицій із цінами · мінімум 246 zł · Варшава і 25 км',
  ru: '105 позиций с ценами · минимум 246 zł · Варшава и 25 км',
  en: '105 priced items · from 246 zł · Warsaw and 25 km',
}

const b64 = async (f) => (await readFile(`public/fonts/${f}`)).toString('base64')
// Шрифты вшиваем как data: — headless-браузер не ходит в dev-сервер.
// Нужны ОБА латинских сабсета: базовые A–Z лежат в latin, а польские
// диакритики (ł, ą, ę) — в latin-ext. С одним latin-ext браузер считает,
// что шрифт покрывает всю латиницу, глифов не находит и падает на засечный.
const interLat = await b64('intertight-latin.woff2')
const interLatX = await b64('intertight-latin-ext.woff2')
const interCyr = await b64('intertight-cyrillic.woff2')
const onestLat = await b64('onest-400-600-latin.woff2')
const onestLatX = await b64('onest-400-600-latin-ext.woff2')
const onestCyr = await b64('onest-400-600-cyrillic.woff2')

const R_LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122'
const R_LATX = 'U+0100-02BA, U+1E00-1E9F, U+2020, U+20A0-20AB, U+2C60-2C7F'
const R_CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'

const html = (locale) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:IT;src:url(data:font/woff2;base64,${interLat}) format('woff2');font-weight:400 800;unicode-range:${R_LAT}}
@font-face{font-family:IT;src:url(data:font/woff2;base64,${interLatX}) format('woff2');font-weight:400 800;unicode-range:${R_LATX}}
@font-face{font-family:IT;src:url(data:font/woff2;base64,${interCyr}) format('woff2');font-weight:400 800;unicode-range:${R_CYR}}
@font-face{font-family:ON;src:url(data:font/woff2;base64,${onestLat}) format('woff2');font-weight:400 600;unicode-range:${R_LAT}}
@font-face{font-family:ON;src:url(data:font/woff2;base64,${onestLatX}) format('woff2');font-weight:400 600;unicode-range:${R_LATX}}
@font-face{font-family:ON;src:url(data:font/woff2;base64,${onestCyr}) format('woff2');font-weight:400 600;unicode-range:${R_CYR}}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#14161A;color:#fff;font-family:ON,sans-serif;
     display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;overflow:hidden;position:relative}
.dot{position:absolute;right:-160px;top:-160px;width:520px;height:520px;border-radius:50%;
     background:radial-gradient(circle at 30% 30%,#FF6A3D,#FF4B12 60%,#D93A00);opacity:.92}
.brand{font-family:IT;font-weight:800;font-size:30px;letter-spacing:-.03em;position:relative}
.brand i{color:#FF4B12;font-style:normal}
h1{font-family:IT;font-weight:700;font-size:76px;line-height:1.02;letter-spacing:-.04em;
   white-space:pre-line;max-width:15ch;position:relative}
.sub{font-size:23px;color:#B9BEC6;position:relative}
.bar{display:flex;align-items:center;gap:14px;position:relative}
.pill{border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:10px 20px;font-size:19px}
.pill--hot{background:#FF4B12;border-color:transparent;color:#14161A;font-weight:600}
</style></head><body>
<div class="dot"></div>
<div class="brand">HAWK<i>.</i>FIX</div>
<h1>${TAGLINE[locale]}</h1>
<div class="bar"><span class="pill pill--hot">hawkfix.pl</span><span class="pill">${SUB[locale]}</span></div>
</body></html>`

await mkdir('public/og', { recursive: true })
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
for (const loc of Object.keys(TAGLINE)) {
  await page.setContent(html(loc), { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `public/og/og-${loc}.png` })
  console.log(`  og-${loc}.png`)
}
await browser.close()
