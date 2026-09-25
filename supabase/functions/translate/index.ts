// HAWK.FIX — перевод с польского на uk / ru / en через Barabash AI (Qwen).
//
// Зовётся из браузера администратора при публикации: сайт и панель правятся
// только по-польски, остальные языки получаются этим переводом. Ключ модели
// лежит в секретах Supabase (BARABASH_AI_KEY) — в браузер он не попадает.
//
// Вход:  { to: 'uk' | 'ru' | 'en', texts: string[] }   (до 40 строк)
// Выход: { out: string[] }  — та же длина и порядок.
//
// Модель отвечает JSON-массивом. Если массив не той длины или не разобрался,
// пакет делится пополам и переводится по частям — до одной строки. Так один
// капризный ответ не срывает всю публикацию.

const LANG: Record<string, string> = { uk: 'ukraiński', ru: 'rosyjski', en: 'angielski (brytyjski)' }

const SYSTEM = (lang: string) => `Jesteś zawodowym tłumaczem strony internetowej firmy HAWK.FIX — „złota rączka” w Warszawie: drobne naprawy domowe, hydraulika, elektryka, montaż mebli i AGD, ściany i malowanie, sprzątanie, przeprowadzki, ogród.
Tłumaczysz z polskiego na język: ${lang}.
Zasady:
- Tłumacz naturalnie, jak native speaker, krótko i rzeczowo — to teksty strony i nazwy usług w cenniku.
- Glosariusz (PL → UK / RU / EN): bateria, kran = змішувач / смеситель / tap; odpływ = злив / слив / drain; syfon = сифон / сифон / trap; gniazdko = розетка / розетка / socket; włącznik = вимикач / выключатель / switch; kaucja = застава / залог / deposit; złota rączka = майстер на годину / мастер на час / handyman; fachowiec = майстер / мастер / specialist; kosztorys = кошторис / смета / estimate; wycena = оцінка / оценка / quote; mb (metr bieżący) = пог. м / пог. м / lin. m.
- Nie tłumacz: HAWK.FIX, adresów, numerów telefonów, e-maili.
- Zachowaj dokładnie tagi HTML i ich atrybuty (style), znaczniki w klamrach {takie}, liczby, „zł”, %, znaki interpunkcyjne i wielkość liter nagłówków.
- Odpowiedz WYŁĄCZNIE tablicą JSON stringów: tyle samo elementów, ta sama kolejność. Bez komentarzy i bez obiektów.`

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

async function ask(texts: string[], to: string): Promise<string[] | null> {
  const key = Deno.env.get('BARABASH_AI_KEY')
  if (!key) throw new Error('no_ai_key')
  const url = Deno.env.get('BARABASH_AI_URL') ?? 'https://barabash-ai.tailcd3444.ts.net/v1/chat/completions'
  const model = Deno.env.get('BARABASH_AI_MODEL') ?? 'qwen3.5:27b'
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 110_000)
  try {
    const r = await fetch(url, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, think: false, temperature: 0.1, stream: false,
        messages: [{ role: 'system', content: SYSTEM(LANG[to]) }, { role: 'user', content: JSON.stringify(texts) }],
      }),
    })
    if (!r.ok) throw new Error(`ai_${r.status}`)
    const j = await r.json()
    let txt: string = j?.choices?.[0]?.message?.content ?? ''
    const m = txt.match(/\[[\s\S]*\]/)
    if (m) txt = m[0]
    const arr = JSON.parse(txt)
    if (!Array.isArray(arr) || arr.length !== texts.length) return null
    // Одиночная строка иногда приходит объектом {"text": …}
    const out = arr.map((x) => (typeof x === 'string' ? x : typeof x?.text === 'string' ? x.text : null))
    return out.some((x) => x === null || !String(x).trim()) ? null : (out as string[])
  } catch (e) {
    if ((e as Error).message.startsWith('ai_') || (e as Error).message === 'no_ai_key') throw e
    if ((e as Error).name === 'AbortError') throw new Error('ai_timeout')
    return null        // неразборчивый ответ — делим пакет
  } finally {
    clearTimeout(timer)
  }
}

async function translate(texts: string[], to: string, depth = 0): Promise<string[]> {
  const got = await ask(texts, to)
  if (got) return got
  if (texts.length === 1) {
    if (depth > 2) throw new Error('ai_bad_answer')
    return translate(texts, to, depth + 1)          // ещё попытка для одной строки
  }
  const mid = Math.ceil(texts.length / 2)
  return [...await translate(texts.slice(0, mid), to), ...await translate(texts.slice(mid), to)]
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  // Переводить может только администратор: спрашиваем базу от его имени
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: req.headers.get('authorization') ?? '', 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!who.ok || (await who.json()) !== true) return json({ error: 'forbidden' }, 403, origin)

  let body: { to?: string; texts?: unknown }
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400, origin) }
  const to = String(body.to ?? '')
  if (!LANG[to]) return json({ error: 'bad_lang' }, 400, origin)
  const texts = Array.isArray(body.texts) ? body.texts.map((x) => String(x ?? '')) : []
  if (!texts.length || texts.length > 40) return json({ error: 'bad_texts' }, 400, origin)

  try {
    // Пустые строки не гоняем через модель
    const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0)
    const done = idx.length ? await translate(idx.map((i) => texts[i]), to) : []
    const out = [...texts]
    idx.forEach((i, n) => { out[i] = done[n] })
    return json({ out }, 200, origin)
  } catch (e) {
    return json({ error: (e as Error).message }, 502, origin)
  }
})
