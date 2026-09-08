import puppeteer from 'puppeteer'
const FONTS = ['Wix Madefor Display','Inter','Geologica','Commissioner','Manrope']
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Wix+Madefor+Display:wght@400..800&family=Inter:wght@400..800&family=Geologica:wght@300..700&family=Commissioner:wght@300..800&family=Manrope:wght@400..800&display=swap">
<style>
body{margin:0;background:#F2F2F2;font-family:system-ui;padding:28px}
.row{background:#fff;border-radius:14px;padding:22px 26px;margin-bottom:14px}
.name{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin:0 0 10px;font-family:Inter}
h1{font-size:44px;line-height:1.05;letter-spacing:-.035em;font-weight:700;margin:0 0 6px}
p{font-size:19px;margin:0;color:#444;font-weight:500}
</style></head><body>
${FONTS.map(f=>`<div class="row"><p class="name">${f}</p>
<h1 style="font-family:'${f}'">Złota rączka, której cenę znasz z góry</h1>
<p style="font-family:'${f}'">Ціна відома наперед · Цена известна заранее · 246 zł</p></div>`).join('')}
</body></html>`
const b = await puppeteer.launch({headless:'new',args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:1000,height:1100,deviceScaleFactor:2})
await p.setContent(html,{waitUntil:'networkidle0'})
await p.evaluate(()=>document.fonts.ready)
await new Promise(r=>setTimeout(r,600))
await p.screenshot({path:process.argv[2],fullPage:true})
await b.close()
