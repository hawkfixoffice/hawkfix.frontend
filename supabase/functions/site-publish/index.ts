// HAWK.FIX — «Опубликовать для Google» из визуального редактора.
//
// Правки редактора и цены видны на живом сайте сразу (сайт дочитывает их из
// базы), но статический HTML, который читают поисковики, обновляется только
// пересборкой. Функция просит GitHub Actions пересобрать сайт событием
// `content-updated` — workflow его уже слушает (repository_dispatch).
//
// Нужен секрет GITHUB_DISPATCH_TOKEN: fine-grained токен на репозиторий
// hawkfixoffice/hawkfix.frontend с правом Contents: Read and write.
// Без него функция честно отвечает `no_github_token`.

const REPO = Deno.env.get('GITHUB_REPO') ?? 'hawkfixoffice/hawkfix.frontend'

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  // Кто зовёт: спрашиваем базу от имени пользователя — is_admin() смотрит в staff
  const auth = req.headers.get('authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const who = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!who.ok || (await who.json()) !== true) return json({ error: 'forbidden' }, 403, origin)

  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN')
  if (!token) return json({ error: 'no_github_token' }, 200, origin)

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hawkfix-site-publish',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'content-updated' }),
  })
  if (!res.ok) return json({ error: `github_${res.status}` }, 200, origin)
  return json({ ok: true }, 200, origin)
})
