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

// --- отправка заявки: форма идёт по шагам ---
// Шаг 1 — контакты
await page.type('#lf-name', 'TEST E2E')
await page.type('#lf-phone', '+48 500 111 333')
await page.click('.lead__nav .lead__submit')
await page.waitForSelector('.addr__box input', { timeout: 8000 })
check(true, 'шаг 1 → 2: контакты приняты, показан адрес')

// Имя запомнилось на устройстве — приветствие над поиском
const remembered = await page.evaluate(() => localStorage.getItem('hawkfix.client'))
check(remembered && JSON.parse(remembered).name === 'TEST E2E', 'имя записано в localStorage')

// Шаг 2 — адрес с подсказками из OSM
await page.type('.addr__box input', 'Marszalkowska 10')
const suggested = await page.waitForSelector('.addr__list button', { timeout: 12000 }).catch(() => null)
check(Boolean(suggested), 'геокодер отдал подсказки адреса')
if (suggested) {
  await suggested.click()
  await new Promise((r) => setTimeout(r, 350))
  // Список висит в портале поверх липкой кнопки: клик по подсказке должен
  // подставить адрес и оставить нас на этом же шаге, а не нажать «Далее»
  const after = await page.evaluate(() => ({
    value: document.querySelector('.addr__box input')?.value ?? '',
    step: document.querySelector('.lead')?.dataset.step,
  }))
  check(after.value.length > 6, `адрес подтверждён выбором: «${after.value}»`)
  check(after.step === 'where', 'клик по подсказке не перелистнул шаг')
}
await page.click('.lead__nav .lead__submit')

// Шаг 3 — дата, следом окна приезда
await page.waitForSelector('#lf-when', { timeout: 8000 })
const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
await page.evaluate((d) => {
  const el = document.querySelector('#lf-when')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, d)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, day)
const slot = await page.waitForSelector('.slot', { timeout: 8000 }).catch(() => null)
check(Boolean(slot), 'после выбора даты появились окна приезда')
if (slot) await slot.click()
check(await page.$eval('.slot[data-on]', (e) => e.textContent.trim()).catch(() => null),
      'окно приезда выбрано')
await page.click('.lead__nav .lead__submit')

// Шаг 4 — детали и отправка
await page.waitForSelector('#lf-comment', { timeout: 8000 })
await page.type('#lf-comment', 'автотест, удалить')
check((await page.$$('.lead__recap li')).length >= 3, 'на последнем шаге показана сводка заявки')
await page.screenshot({ path: `${SHOTS}/e2e-form.png`, clip: await page.$eval('.calc__sum', (e) => {
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }
}) })
await page.click('.lead__nav .lead__submit')

// Чек печатается поверх страницы, потом улетает
const receipt = await page.waitForSelector('.rcp', { timeout: 8000 }).catch(() => null)
check(Boolean(receipt), 'показана печать чека на весь экран')
await page.waitForSelector('.rcp__amount', { timeout: 8000 })
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: `${SHOTS}/e2e-receipt.png` })
check(await page.$eval('.rcp__rows .num', (e) => e.textContent.trim()) === 'HF-E2E-0001',
      'на чеке напечатан номер заявки из ответа')

await page.waitForSelector('.lead--ok', { timeout: 20000 })
check(true, 'заявка отправлена, показан экран успеха')
check(submitted?.contact?.name === 'TEST E2E' && Array.isArray(submitted?.items),
      `в запросе ушли контакт и ${submitted?.items?.length ?? 0} позиц.`)
check(Boolean(submitted?.place?.address) && submitted?.whenTime,
      `адрес и окно приезда ушли в заявку (${submitted?.whenTime})`)
check(await page.$eval('.lead__order b', (e) => e.textContent.trim()) === 'HF-E2E-0001',
      'номер заказа из ответа показан клиенту')

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
