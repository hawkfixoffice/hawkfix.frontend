/**
 * Качает кандидатов на ключ во временную папку для визуального отбора.
 *
 * Порядок выдачи Unsplash — релевантность, а нам нужна ещё и «насмотренность»:
 * забираем широкую выборку и пересортировываем по числу лайков, отбрасывая
 * мелкие кадры и вертикали. Так наверх поднимаются снимки с нормальным светом
 * и композицией, а не первый попавшийся сток.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const DIR = process.argv[2]
const N = Number(process.argv[3] || 6)
const specs = JSON.parse(process.argv[4])   // { key: "query" | ["q1", "q2"] }
const MIN_W = Number(process.env.MIN_W || 2400)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(DIR, { recursive: true })

async function search(query) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}` +
              `&per_page=30&orientation=landscape`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const json = await res.json()
  return json.results || []
}

const out = {}
for (const [key, spec] of Object.entries(specs)) {
  const queries = Array.isArray(spec) ? spec : [spec]
  const seen = new Set()
  let pool = []
  for (const q of queries) {
    for (const p of await search(q)) {
      const raw = p.urls?.raw || ''
      if (raw.includes('plus.unsplash.com')) continue        // платный Unsplash+
      if (!p.width || p.width < MIN_W) continue              // мастер должен быть крупным
      if (p.width / p.height < 1.25) continue                // почти квадрат под 3:2 не режется
      if (seen.has(p.id)) continue
      seen.add(p.id)
      pool.push(p)
    }
    await sleep(250)
  }
  pool.sort((a, b) => (b.likes || 0) - (a.likes || 0))
  const picked = pool.slice(0, N)
  out[key] = []
  for (const [i, p] of picked.entries()) {
    const dl = `${p.urls.raw}&w=900&q=75&fm=jpg&fit=crop&crop=entropy`
    const file = `${DIR}/${key}__${String(i).padStart(2, '0')}.jpg`
    const r = await fetch(dl)
    await pipeline(Readable.fromWeb(r.body), createWriteStream(file))
    out[key].push({
      i, id: p.id, alt: p.alt_description || p.description || '', author: p.user?.name || '',
      link: p.links?.html || '', raw: p.urls.raw, color: p.color,
      likes: p.likes || 0, w: p.width, h: p.height,
    })
  }
  console.log(`${key.padEnd(20)} ${picked.length} из ${pool.length} (лайки ${picked.map((p) => p.likes).join('/')})`)
  await sleep(250)
}
await writeFile(`${DIR}/candidates.json`, JSON.stringify(out, null, 1))
