import puppeteer from 'puppeteer'
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage()
p.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)))
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)))
await p.setViewport({ width: 1200, height: 900 })
await p.goto('http://localhost:5174/panel/', { waitUntil: 'networkidle0' })
await p.waitForSelector('#u'); await p.type('#u', 'Jan Kowalski'); await p.type('#p', 'Test_12345')
await p.click('.login__box .btn--primary')
await p.waitForSelector('.tabs, .burger')
// ловим ошибки карты
await p.evaluateOnNewDocument(() => {})
await p.evaluate(() => { window.__mapErrors = [] })
await p.evaluate((id) => { location.hash = `#/orders/${id}` }, process.env.ORD ?? '')
await new Promise(r => setTimeout(r, 10000))
console.log(await p.evaluate(() => ({
  tiles: performance.getEntriesByType('resource').filter(r => /\.pbf|\/planet\//.test(r.name)).length,
  reqs: performance.getEntriesByType('resource').filter(r => r.name.includes('openfreemap')).map(r => r.name.split('openfreemap.org')[1]?.slice(0, 40)),
})))
await b.close()
