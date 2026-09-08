/** Скриншот страницы. node tools/shot.mjs <url> <out> [width] [full]
 *  Перед снимком прокручивает страницу, иначе lazy-картинки останутся пустыми. */
import puppeteer from 'puppeteer'

const [, , url, out, w = '1440', full = 'true'] = process.argv
const width = Number(w)

const browser = await puppeteer.launch({
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000,
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: 2 })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

// Прокрутка шагами: по одному вызову на шаг, чтобы не держать CDP надолго
const height = await page.evaluate(() => document.documentElement.scrollHeight)
const vh = width < 500 ? 844 : 900
for (let y = 0; y < height; y += Math.round(vh * 0.8)) {
  await page.evaluate((py) => window.scrollTo(0, py), y)
  await new Promise((r) => setTimeout(r, 140))
}
await page.evaluate(() => window.scrollTo(0, 0))
await new Promise((r) => setTimeout(r, 900))

const notLoaded = await page.evaluate(
  () => Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
)
await page.screenshot({ path: out, fullPage: full === 'true' })

console.log(errors.length ? `ОШИБКИ КОНСОЛИ (${errors.length}):\n  ${errors.slice(0, 8).join('\n  ')}` : 'консоль чистая')
if (notLoaded.length) console.log(`НЕ ЗАГРУЗИЛИСЬ картинки (${notLoaded.length}):\n  ${notLoaded.slice(0, 6).join('\n  ')}`)
else console.log('все картинки загружены')
await browser.close()
