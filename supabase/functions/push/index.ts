// Пуши приложению HAWK.FIX через Firebase Cloud Messaging (HTTP v1).
//
// Зовёт только база: триггеры из 0025_push.sql шлют сюда событие через
// pg_net с подписью из vault (x-hawk-push). Из браузера функцию не зовут,
// поэтому CORS здесь нет вовсе.
//
// Секреты проекта:
//   FCM_SERVICE_ACCOUNT — JSON сервисного аккаунта Firebase целиком;
//   PUSH_HOOK_SECRET    — та же строка, что в vault под именем push_hook.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY подставляет платформа.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Lang = 'pl' | 'ru' | 'en'
interface Event {
  type: 'offer' | 'assigned' | 'edited' | 'no_master' | 'finished'
  staff_ids: string[]
  order_id: string
  order_no: string
  address?: string | null
  when?: string | null
  total?: number | null
}

/** Тексты на языке устройства: язык человек выбирает в приложении. */
const TEXT: Record<Event['type'], Record<Lang, [string, string]>> = {
  offer: {
    pl: ['Nowe zlecenie {no}', '{where} · {when} · {sum}. Potwierdź w aplikacji.'],
    ru: ['Новый заказ {no}', '{where} · {when} · {sum}. Подтвердите в приложении.'],
    en: ['New job {no}', '{where} · {when} · {sum}. Confirm in the app.'],
  },
  assigned: {
    pl: ['Zlecenie {no} przydzielone Tobie', '{where} · {when}'],
    ru: ['Заказ {no} назначен вам', '{where} · {when}'],
    en: ['Job {no} assigned to you', '{where} · {when}'],
  },
  edited: {
    pl: ['Zmiana w zleceniu {no}', 'Nowy termin: {when}. {where}'],
    ru: ['Заказ {no} изменён', 'Новое время: {when}. {where}'],
    en: ['Job {no} changed', 'New time: {when}. {where}'],
  },
  no_master: {
    pl: ['Zlecenie {no} bez ekipy', 'Nikt nie przyjął — przydziel ręcznie.'],
    ru: ['Заказ {no} без мастера', 'Никто не взял — назначьте вручную.'],
    en: ['Job {no} has no crew', 'Nobody took it — assign by hand.'],
  },
  finished: {
    pl: ['Zlecenie {no} zamknięte', 'Raport złożony · {sum}'],
    ru: ['Заказ {no} закрыт', 'Отчёт сдан · {sum}'],
    en: ['Job {no} closed', 'Report filed · {sum}'],
  },
}

const fill = (s: string, e: Event) =>
  s.replace('{no}', e.order_no)
    .replace('{where}', e.address || '—')
    .replace('{when}', e.when || '—')
    .replace('{sum}', e.total != null ? `${Math.round(e.total)} zł` : '—')
    .replace(/( · —)+/g, '').replace(/^— · /, '')

/* ---------- OAuth-токен Google из сервисного аккаунта ---------- */
const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let cached: { token: string; exp: number } | null = null

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp > now + 60) return cached.token

  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const der = Uint8Array.from(
    atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${b64url(sig)}`,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`oauth ${res.status}: ${JSON.stringify(data)}`)
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600) }
  return cached.token
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })

  const secret = Deno.env.get('PUSH_HOOK_SECRET')
  if (!secret || req.headers.get('x-hawk-push') !== secret) return new Response('forbidden', { status: 403 })

  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return Response.json({ ok: false, reason: 'no FCM_SERVICE_ACCOUNT' })
  const sa = JSON.parse(raw)

  const e = (await req.json()) as Event
  if (!TEXT[e.type] || !Array.isArray(e.staff_ids) || e.staff_ids.length === 0) {
    return Response.json({ ok: true, sent: 0 })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: devices } = await db.from('device_tokens')
    .select('token, lang').in('staff_id', e.staff_ids)
  if (!devices?.length) return Response.json({ ok: true, sent: 0 })

  const token = await accessToken(sa)
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  let sent = 0
  const dead: string[] = []

  await Promise.all(devices.map(async (d) => {
    const [title, body] = TEXT[e.type][(d.lang as Lang) in TEXT[e.type] ? (d.lang as Lang) : 'pl']
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token: d.token,
        notification: { title: fill(title, e), body: fill(body, e) },
        // по order_id приложение открывает карточку заказа
        data: { order_id: e.order_id, type: e.type },
        android: { priority: 'HIGH', notification: { channel_id: 'hawkfix', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      } }),
    })
    if (res.ok) { sent++; return }
    // Токен умер (приложение удалено) — убираем, чтобы не слать в пустоту
    if (res.status === 404 || res.status === 410) dead.push(d.token)
    else console.error('fcm', res.status, await res.text())
  }))

  if (dead.length) await db.from('device_tokens').delete().in('token', dead)
  return Response.json({ ok: true, sent, removed: dead.length })
})
