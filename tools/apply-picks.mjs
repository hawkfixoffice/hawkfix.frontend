/**
 * Ставит отобранные вручную кадры в assets/photos (мастера, вне сборки)
 * и обновляет content/photos.json.
 *
 * Запуск: node tools/apply-picks.mjs <папка-кандидатов> <picks.json>
 * picks.json: { "<ключ картинки>": { "group": "<ключ в candidates.json>", "i": 0 } }
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const DIR = process.argv[2]
const PICKS = JSON.parse(await readFile(process.argv[3], 'utf8'))
// Мастера берём с запасом по ширине: из них режутся все производные.
const MASTER_W = { hero: 3200, 'hero-alt': 2600 }

await mkdir('assets/photos', { recursive: true })
const cands = JSON.parse(await readFile(`${DIR}/candidates.json`, 'utf8'))
const manifest = JSON.parse(await readFile('content/photos.json', 'utf8'))

for (const [key, sel] of Object.entries(PICKS)) {
  const p = cands[sel.group ?? key]?.[sel.i]
  if (!p) { console.log(`  ✗ ${key} — нет кандидата ${sel.group ?? key}#${sel.i}`); continue }
  const w = MASTER_W[key] ?? 2200
  const url = `${p.raw}&w=${w}&q=88&fm=jpg&fit=crop&crop=entropy`
  const res = await fetch(url)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`assets/photos/${key}.jpg`))
  manifest[key] = { id: p.id, alt: p.alt, author: p.author, link: p.link, color: p.color, picked: true }
  console.log(`  ✓ ${key.padEnd(20)} ${String(p.alt).slice(0, 54)}`)
}
await writeFile('content/photos.json', JSON.stringify(manifest, null, 1))
