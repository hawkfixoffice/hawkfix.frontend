// HAWK.FIX — приём заявок с сайта.
// Единственный путь записи в таблицу leads: у неё нет ни одной RLS-политики,
// поэтому anon-ключом туда не попасть, а функция ходит service-ключом.

const ALLOWED_ORIGINS = [
  'https://hawkfix.pl',
  'https://www.hawkfix.pl',
  'http://localhost:4173',
  'http://localhost:5173',
]

const LOCALES = ['pl', 'uk', 'ru', 'en']

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  })

/** Проверка токена Cloudflare Turnstile. Включается, когда задан секрет. */
async function turnstileOk(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (!secret) return true               // защита выключена — пропускаем
  if (!token) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: form,
  })
  const out = await res.json().catch(() => ({ success: false }))
  return Boolean(out.success)
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_json' }, 400, origin)
  }

  // Ловушка для ботов: поле скрыто в вёрстке, человек его не заполнит
  if (str(body.company, 200)) return json({ ok: true }, 200, origin)

  const contact = (body.contact ?? {}) as Record<string, unknown>
  const place = (body.place ?? {}) as Record<string, unknown>

  const name = str(contact.name, 200)
  const phoneRaw = str(contact.phone, 40)
  const digits = phoneRaw ? phoneRaw.replace(/\D/g, '') : ''
  if (!name || digits.length < 9) return json({ error: 'name_or_phone' }, 422, origin)

  const items = Array.isArray(body.items) ? body.items.slice(0, 120) : []
  const comment = str(body.comment, 4000)
  if (items.length === 0 && !comment) return json({ error: 'empty_request' }, 422, origin)

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')
  if (!(await turnstileOk(str(body.turnstile, 4000) ?? undefined, ip))) {
    return json({ error: 'captcha' }, 403, origin)
  }

  const locale = LOCALES.includes(String(body.locale)) ? String(body.locale) : 'pl'
  const whenRaw = str(body.when, 20)
  const when = whenRaw && /^\d{4}-\d{2}-\d{2}$/.test(whenRaw) ? whenRaw : null

  const row = {
    locale,
    name,
    phone: phoneRaw,
    email: str(contact.email, 320),
    district: str(place.district, 120),
    address: str(place.address, 300),
    when_date: when,
    comment,
    urgent: Boolean(body.urgent),
    items,
    totals: (body.totals ?? {}) as Record<string, unknown>,
    page: str(body.page, 300),
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400),
  }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'not_configured' }, 500, origin)

  const res = await fetch(`${url}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })

  if (!res.ok) {
    console.error('insert failed', res.status, await res.text())
    return json({ error: 'store_failed' }, 500, origin)
  }

  const [saved] = await res.json()
  return json({ ok: true, id: saved?.id }, 200, origin)
})
