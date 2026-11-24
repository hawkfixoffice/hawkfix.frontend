/** Сквозная проверка калькулятора, формы WhatsApp в герое и попапа на собранном сайте. */
import puppeteer from 'puppeteer'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const SHOTS = process.argv[3] ?? '/tmp'
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 })

// Заявку до сервера не пускаем: иначе каждый прогон тестов кладёт фиктивную
// строку в leads и шлёт письмо в офис. Проверяем путь до отправки и разбор
// ответа, а сам приём заявки покрыт отдельной проверкой самой функции.
let submitted = null
await page.setRequestInterception(true)
page.on('request', (req) => {
  if (req.method() === 'POST' && /\/functions\/v1\/lead$/.test(req.url())) {
    submitted = JSON.parse(req.postData() || '{}')
    return req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, id: 'e2e', orderNo: 'HF-E2E-0001' }),
    })
  }
  req.continue()
})

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
    // Пока смета пуста, итога нет вовсе (вместо «0 zł» — подсказка)
    const now = await page.$eval('.sum__big', (e) => e.textContent.trim()).catch(() => '')
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

// --- отправка: только WhatsApp (2026-11-24) ---
// Ссылку wa.me не открываем: гасим переход после обработчиков сайта
await page.evaluate(() => window.addEventListener('click', (e) => {
  if (e.target.closest?.('a[href^="https://wa.me/"]') && !e.defaultPrevented) e.preventDefault()
}))
check(!(await page.$('.lead')), 'классической формы заявки нет')
await page.type('#lf-comment', 'автотест, удалить')
const waHref = await page.$eval('.calcsend__btn', (a) => decodeURIComponent(a.href)).catch(() => '')
check(/HF-[2-9A-HJ-NP-Z]{5}/.test(waHref) && /246/.test(waHref) && waHref.includes('автотест'),
      'кнопка калькулятора несёт код, смету и описание')
await page.click('.calcsend__btn')
await new Promise((r) => setTimeout(r, 300))
check(submitted?.channel === 'wa' && submitted.items?.length >= 1 && waHref.includes(submitted.code),
      `черновик ушёл в lead с тем же кодом (${submitted?.code})`)
check(await page.$eval('.calcsend__note', (e) => /HF-/.test(e.textContent)), 'после нажатия показан номер заявки')

// --- герой: «Co się stało?» с подсказками из прайса ---
submitted = null
await page.evaluate(() => scrollTo(0, 0))
await page.type('.s-hero .wabox textarea', 'cieknie kran w łazience')
await page.waitForSelector('.s-hero .wabox__hits button', { timeout: 3000 }).catch(() => null)
const hint = await page.$$eval('.s-hero .wabox__hits button', (b) => b.map((x) => x.textContent.trim()))
check(hint.some((x) => /bateri/i.test(x)), `«cieknie kran…» подсказал: ${hint.join(' | ')}`)
check(!(await page.$$eval('.s-hero .wabox__hits', (l) => l.some((x) => /zł/.test(x.textContent)))), 'в подсказках героя нет цен')
await page.$$eval('.s-hero .wabox__hits button', (b) => b[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
await new Promise((r) => setTimeout(r, 250))
check((await page.$$('.s-hero .wabox__lines li')).length === 1, 'выбранная работа легла строкой с ценой')
await page.screenshot({ path: `${SHOTS}/e2e-hero.png` })
await page.click('.s-hero .wabox__send')
await new Promise((r) => setTimeout(r, 300))
check(submitted?.channel === 'wa' && submitted.comment === 'cieknie kran w łazience' && submitted.items?.length === 1,
      'из героя ушёл черновик с работой и описанием')

// --- кнопка WhatsApp в шапке открывает попап ---
await page.evaluate(() => document.querySelector('header a[href^="https://wa.me/"]')?.click())
await new Promise((r) => setTimeout(r, 300))
check(Boolean(await page.$('.wamodal .wabox')), 'WhatsApp в шапке открыл попап с формой')
await page.keyboard.press('Escape')

console.log('\nПРОЙДЕНО:')
ok.forEach((m) => console.log('  ✓ ' + m))
if (bad.length) { console.log('ПРОВАЛЕНО:'); bad.forEach((m) => console.log('  ✗ ' + m)) }
console.log(errors.length ? `\nОШИБКИ КОНСОЛИ (${errors.length}):\n  ${errors.slice(0, 6).join('\n  ')}` : '\nконсоль чистая')
await browser.close()
process.exit(bad.length ? 1 : 0)
