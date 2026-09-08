/** Сквозная проверка калькулятора и формы заявки на собранном сайте. */
import puppeteer from 'puppeteer'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const SHOTS = process.argv[3] ?? '/tmp'
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 })

const ok = []
const bad = []
const check = (cond, msg) => (cond ? ok : bad).push(msg)

await page.goto(BASE, { waitUntil: 'networkidle0' })

// --- баннер cookie: есть, запоминает выбор ---
const hasBanner = await page.$('.cookie__box')
check(Boolean(hasBanner), 'баннер cookie показан при первом визите')
await page.click('.cookie__actions .btn--ghost')            // «Только необходимые»
await new Promise((r) => setTimeout(r, 300))
check(!(await page.$('.cookie__box')), 'баннер закрылся после выбора')
const consent = await page.evaluate(() => localStorage.getItem('hawkfix.consent'))
check(consent && JSON.parse(consent).analytics === false, 'выбор записан в localStorage (analytics=false)')

// --- калькулятор: добавление позиции пересчитывает сумму ---
await page.evaluate(() => document.querySelector('#wycena')?.scrollIntoView())
await new Promise((r) => setTimeout(r, 400))
/** Сумма набегает анимацией — ждём, пока значение перестанет меняться. */
async function settledTotal() {
  let prev = null
  for (let i = 0; i < 25; i++) {
    const now = await page.$eval('.sum__big', (e) => e.textContent.trim())
    if (now === prev) return now
    prev = now
    await new Promise((r) => setTimeout(r, 120))
  }
  return prev
}

const totalBefore = await settledTotal()
await page.click('.calc__chips .chip--pick')
const totalAfter = await settledTotal()
check(totalBefore !== totalAfter, `сумма пересчиталась: «${totalBefore}» → «${totalAfter}»`)

// минимум выезда: одна дешёвая позиция должна подтянуться до минимума
check(/246/.test(totalAfter), `сработал минимум выезда 246 zł (итог «${totalAfter}»)`)

// --- поиск ---
await page.type('.calc__search input', 'kran')
await new Promise((r) => setTimeout(r, 400))
const found = await page.$$eval('.ilist .irow__name', (n) => n.map((x) => x.textContent))
check(found.length > 0, `поиск «kran» нашёл ${found.length} позиц.`)
await page.click('.calc__search button')

// --- отправка заявки ---
await page.type('#lf-name', 'TEST E2E')
await page.type('#lf-phone', '+48 500 111 333')
await page.type('#lf-comment', 'автотест, удалить')
await page.screenshot({ path: `${SHOTS}/e2e-form.png`, clip: await page.$eval('.calc__sum', (e) => {
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }
}) })
await page.click('.lead__submit')
await page.waitForSelector('.lead--ok', { timeout: 20000 })
check(true, 'заявка отправлена, показан экран успеха')

// --- Lottie реально отрисовался ---
await new Promise((r) => setTimeout(r, 1200))
const svg = await page.$eval('.lead--ok', (e) => {
  const s = e.querySelector('svg')
  return s ? { paths: s.querySelectorAll('path').length, w: s.clientWidth } : null
})
check(svg && svg.paths > 0, `Lottie отрисовал SVG (${svg ? svg.paths : 0} path)`)
await page.screenshot({ path: `${SHOTS}/e2e-success.png`, clip: await page.$eval('.calc__sum', (e) => {
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 600) }
}) })

console.log('\nПРОЙДЕНО:')
ok.forEach((m) => console.log('  ✓ ' + m))
if (bad.length) { console.log('ПРОВАЛЕНО:'); bad.forEach((m) => console.log('  ✗ ' + m)) }
console.log(errors.length ? `\nОШИБКИ КОНСОЛИ (${errors.length}):\n  ${errors.slice(0, 6).join('\n  ')}` : '\nконсоль чистая')
await browser.close()
process.exit(bad.length ? 1 : 0)
