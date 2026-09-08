/** Ставит отобранные вручную кадры в public/img и обновляет content/photos.json. */
import { readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const S = process.argv[2]
// key -> [папка кандидатов, ключ поиска, индекс, ширина]
const PICKS = {
  hero:               ['cand-hero', 'a', 5, 2600],
  'hero-alt':         ['cand-hero', 'c', 0, 2000],
  appliances:         ['cand-fix', 'appliances', 4, 1600],
  disposal:           ['cand-fix', 'disposal', 3, 1600],
  doors:              ['cand-fix', 'doors', 3, 1600],
  electrics:          ['cand-fix', 'electrics', 4, 1600],
  'furniture-repair': ['cand-fix', 'furniture-repair', 1, 1600],
  plumbing:           ['cand-fix', 'plumbing', 0, 1600],
  renovation:         ['cand-fix', 'renovation', 2, 1600],
  urgent:             ['cand-fix', 'urgent', 1, 1600],
}

const manifest = JSON.parse(await readFile('content/photos.json', 'utf8'))
for (const [key, [dir, group, idx, w]] of Object.entries(PICKS)) {
  const cands = JSON.parse(await readFile(`${S}/${dir}/candidates.json`, 'utf8'))
  const p = cands[group][idx]
  const url = `${p.raw}&w=${w}&q=80&fm=jpg&fit=crop&crop=entropy`
  const res = await fetch(url)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`public/img/${key}.jpg`))
  manifest[key] = { id: p.id, alt: p.alt, author: p.author, link: p.link, color: p.color, picked: true }
  console.log(`  ✓ ${key.padEnd(18)} ${p.alt.slice(0, 56)}`)
}
await writeFile('content/photos.json', JSON.stringify(manifest, null, 1))
