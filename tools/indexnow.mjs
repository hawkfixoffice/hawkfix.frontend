/**
 * IndexNow: сообщить Bing, Яндексу, Seznam и Naver, что страницы обновились.
 * Поиск ChatGPT и Copilot работают на индексе Bing — без пинга свежие цены
 * и тексты доходят туда неделями.
 *
 *   node tools/indexnow.mjs            — все адреса из dist/sitemap.xml
 *
 * Запускается в CI после деплоя и только для боевого домена: витрина закрыта
 * от индекса, пинговать её незачем. Ключ публичный по протоколу, файл
 * `<ключ>.txt` кладёт в корень сайта tools/postbuild.mjs.
 */
import { readFile } from 'node:fs/promises'

const KEY = 'aa7c2d65e76f5aec83eb114e32c55cdc'
const xml = await readFile('dist/sitemap.xml', 'utf8')
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
if (!urls.length) { console.log('IndexNow: в sitemap нет адресов'); process.exit(0) }

const host = new URL(urls[0]).host
if (host !== 'hawkfix.pl') {
  console.log(`IndexNow: сборка для ${host}, не боевая — пропускаю`)
  process.exit(0)
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList: urls }),
})
// 200/202 — принято. Ошибку не превращаем в падение деплоя: сайт уже выложен.
console.log(`IndexNow: ${urls.length} адресов → HTTP ${res.status}`)
if (res.status >= 400) console.log(await res.text())
