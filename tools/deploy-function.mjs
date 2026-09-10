/** Выкатка edge-функции через Management API.
 *  Функция живёт в Supabase и НЕ деплоится вместе с сайтом, поэтому
 *  после правки supabase/functions/<slug>/index.ts нужен отдельный запуск:
 *
 *    SUPABASE_PAT=sbp_… node tools/deploy-function.mjs lead
 *
 *  Токен берётся только из окружения — в репозиторий он не попадает. */
import { readFileSync } from 'node:fs'

const slug = process.argv[2] ?? 'lead'
const ref = process.env.SUPABASE_REF ?? 'vpijumbbmwjibvlohfug'
const pat = process.env.SUPABASE_PAT
if (!pat) { console.error('нужен SUPABASE_PAT'); process.exit(1) }

const path = `supabase/functions/${slug}/index.ts`
const code = readFileSync(path, 'utf8')

const form = new FormData()
form.append('metadata', JSON.stringify({
  name: slug,
  entrypoint_path: 'index.ts',
  // Функция вызывается формой сайта без авторизации: JWT здесь не при чём,
  // защита — CORS, honeypot и (когда включим) Turnstile.
  verify_jwt: false,
}))
form.append('file', new File([code], 'index.ts', { type: 'application/typescript' }))

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,
  { method: 'POST', headers: { Authorization: `Bearer ${pat}` }, body: form },
)

const text = await res.text()
if (!res.ok) { console.error(res.status, text); process.exit(1) }
const out = JSON.parse(text)
console.log(`${slug}: версия ${out.version}, статус ${out.status}`)
