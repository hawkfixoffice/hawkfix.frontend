/** Качает N кандидатов на ключ в /tmp для визуального отбора. */
import { mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const DIR = process.argv[2]
const N = Number(process.argv[3] || 6)
const specs = JSON.parse(process.argv[4])   // { key: "query" }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(DIR, { recursive: true })

const out = {}
for (const [key, query] of Object.entries(specs)) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const json = await res.json()
  const hits = (json.results || []).filter((p) => !(p.urls?.raw || '').includes('plus.unsplash.com') && p.width >= 1600)
  const picked = hits.slice(0, N)
  out[key] = []
  for (const [i, p] of picked.entries()) {
    const dl = `${p.urls.raw}&w=900&q=75&fm=jpg&fit=crop&crop=entropy`
    const file = `${DIR}/${key}__${String(i).padStart(2, '0')}.jpg`
    const r = await fetch(dl)
    await pipeline(Readable.fromWeb(r.body), createWriteStream(file))
    out[key].push({ i, id: p.id, alt: p.alt_description || '', author: p.user?.name || '',
                    link: p.links?.html || '', raw: p.urls.raw, color: p.color })
  }
  console.log(`${key}: ${picked.length} кандидатов`)
  await sleep(300)
}
await writeFile(`${DIR}/candidates.json`, JSON.stringify(out, null, 1))
