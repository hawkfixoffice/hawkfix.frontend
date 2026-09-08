/** Минимальный клиент PostgREST. Ключи только из окружения — в репозиторий не попадают. */
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

export function requireEnv() {
  if (!URL_ || !KEY) {
    throw new Error('нужны SUPABASE_URL и SUPABASE_SERVICE_KEY в окружении')
  }
}

const headers = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
})

/** Пишет пачками: PostgREST плохо переваривает многомегабайтные тела. */
export async function upsert(table, rows, onConflict, chunk = 200) {
  requireEnv()
  // PostgREST требует одинаковый набор ключей во всех объектах пачки:
  // дополняем недостающие значением null.
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const norm = rows.map((r) => Object.fromEntries(keys.map((k) => [k, k in r ? r[k] : null])))

  let done = 0
  for (let i = 0; i < norm.length; i += chunk) {
    const slice = norm.slice(i, i + chunk)
    const res = await fetch(
      `${URL_}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'POST',
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(slice),
      },
    )
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    done += slice.length
  }
  return done
}

export async function selectAll(table, columns = '*', order) {
  requireEnv()
  const params = new URLSearchParams({ select: columns })
  if (order) params.set('order', order)
  const out = []
  const step = 1000
  for (let from = 0; ; from += step) {
    const res = await fetch(`${URL_}/rest/v1/${table}?${params}`, {
      headers: { ...headers(), Range: `${from}-${from + step - 1}` },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < step) break
  }
  return out
}
