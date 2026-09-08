/**
 * Подбирает и качает фотографии с Unsplash под каждую услугу.
 * Платные (plus.unsplash.com) отсеиваются — они не под свободной лицензией.
 * Пишет assets/photos/<key>.jpg и content/photos.json с атрибуцией.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const OUT = 'assets/photos'
const QUERIES = {
  hero:                 ['craftsman hands tools workshop warm light', 'landscape'],
  'hero-alt':           ['modern bright apartment interior sunlight', 'landscape'],
  about:                ['tool belt workshop organized', 'landscape'],
  plumbing:             ['chrome faucet water running close up', 'landscape'],
  drains:               ['kitchen sink drain water', 'landscape'],
  electrics:            ['electrical wiring hands screwdriver socket', 'landscape'],
  furniture:            ['flat pack furniture assembly allen key', 'landscape'],
  'furniture-repair':   ['woodworking hands repairing chair workshop', 'landscape'],
  moving:               ['moving boxes empty apartment', 'landscape'],
  disposal:            ['old furniture pile removal', 'landscape'],
  drilling:             ['power drill wall hands mounting', 'landscape'],
  tv:                   ['television mounted on wall minimal living room', 'landscape'],
  doors:                ['brass door handle detail minimal', 'landscape'],
  appliances:           ['modern kitchen built in oven', 'landscape'],
  bathroom:             ['minimal bathroom tiles shower', 'landscape'],
  ventilation:          ['ventilation grille wall detail', 'landscape'],
  repairs:              ['toolbox hand tools flat lay', 'landscape'],
  floors:               ['laying laminate wooden floor planks', 'landscape'],
  painting:             ['paint roller painting wall white', 'landscape'],
  blinds:               ['window blinds shadow light interior', 'landscape'],
  urgent:               ['water leak pipe emergency', 'landscape'],
  cleaning:             ['cleaning supplies minimal aesthetic', 'landscape'],
  moveout:              ['empty apartment keys handover', 'landscape'],
  'renovation-cleaning':['renovation dust cleaning apartment', 'landscape'],
  'windows-cleaning':   ['window cleaning squeegee glass', 'landscape'],
  plants:               ['repotting houseplant hands soil', 'landscape'],
  relocation:           ['moving van loading city street', 'landscape'],
  'relocation-pl':      ['highway road van travel', 'landscape'],
  garden:               ['hedge trimming garden work', 'landscape'],
  renovation:           ['apartment renovation interior construction', 'landscape'],
}

// Важно: с браузерным User-Agent unsplash.com/napi отдаёт 307 → 401.
// Дефолтный UA node подходит, свой не подставляем.
const UA = { Accept: 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function search(query, orientation) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=24&orientation=${orientation}`
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`search ${res.status}`)
  const json = await res.json()
  return (json.results || []).filter((p) => {
    const raw = p.urls?.raw || ''
    if (raw.includes('plus.unsplash.com')) return false      // платный Unsplash+
    if (!p.width || !p.height) return false
    if (p.width < 1600) return false
    return true
  })
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

const manifest = {}
await mkdir(OUT, { recursive: true })

const keys = Object.keys(QUERIES)
for (const [i, key] of keys.entries()) {
  const [q, orientation] = QUERIES[key]
  try {
    const hits = await search(q, orientation)
    if (!hits.length) { console.log(`  ✗ ${key} — ничего не нашлось`); continue }
    const p = hits[0]
    const w = key.startsWith('hero') ? 2400 : 1600
    const url = `${p.urls.raw}&w=${w}&q=80&fm=jpg&fit=crop&crop=entropy`
    await download(url, `${OUT}/${key}.jpg`)
    manifest[key] = {
      id: p.id, query: q,
      alt: p.alt_description || p.description || '',
      author: p.user?.name || '', authorUrl: p.user?.links?.html || '',
      link: p.links?.html || '', width: p.width, height: p.height,
      color: p.color || '',
    }
    console.log(`  ✓ ${key.padEnd(20)} ${(p.alt_description || '').slice(0, 52)}`)
  } catch (e) {
    console.log(`  ✗ ${key} — ${e.message}`)
  }
  if (i < keys.length - 1) await sleep(350)
}

await writeFile('content/photos.json', JSON.stringify(manifest, null, 1), 'utf8')
console.log(`\nскачано: ${Object.keys(manifest).length} / ${keys.length}`)
