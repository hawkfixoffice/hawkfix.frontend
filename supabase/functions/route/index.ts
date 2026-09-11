// Маршруты для панели. Ключ OpenRouteService живёт здесь, в секретах
// проекта, и в браузер не попадает — поэтому фронт ходит за маршрутом
// сюда, а не напрямую в ORS.
//
// Если ORS недоступен (нет ключа, кончилась квота, сервер молчит), считаем
// по бесплатному OSRM на данных OSM — это по-прежнему дорога по улицам.
// Прямая линия остаётся последним средством, чтобы карта не ломалась совсем.

// Origin отвечаем тот, что пришёл. Список разрешённых адресов здесь ничего
// не защищал: функция публичная, из curl её всё равно видно, а вот панель,
// открытая с непредусмотренного адреса (github.io, www-вариант, другой порт
// разработки), получала чужой Allow-Origin — браузер резал ответ, и в панели
// это выглядело как «сервер маршрутов не ответил». Кук и авторизации тут нет,
// поэтому эхо origin безопасно.
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})

interface Pt { lat: number; lon: number }

/** Расстояние по большому кругу — запасной ответ, когда ORS недоступен. */
function airline(a: Pt, b: Pt): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

function point(v: unknown): Pt | null {
  const o = v as Record<string, unknown> | null
  if (!o) return null
  const lat = num(o.lat), lon = num(o.lon)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors(origin) } })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { body = {} }

  const from = point(body.from)
  const to = point(body.to)
  const via = point(body.via)
  if (!from || !to) {
    return new Response(JSON.stringify({ error: 'bad_points' }), { status: 422, headers: { 'Content-Type': 'application/json', ...cors(origin) } })
  }

  const key = Deno.env.get('ORS_API_KEY')
  const points = [from, ...(via ? [via] : []), to]

  // Без ключа — прямая линия: панель остаётся рабочей, а километры
  // помечаются как приблизительные.
  const straight = () => {
    const legs = points.slice(1).map((p, i) => {
      const km = airline(points[i], p)
      return { km: Math.round(km * 10) / 10, min: Math.round((km / 28) * 60) }  // 28 км/ч по городу
    })
    return {
      approx: true,
      coords: points.map((p) => [p.lon, p.lat]),
      legs,
      total: {
        km: Math.round(legs.reduce((a, l) => a + l.km, 0) * 10) / 10,
        min: legs.reduce((a, l) => a + l.min, 0),
      },
    }
  }

  // Запасной маршрутизатор без ключа: OSRM на данных OSM. Он подхватывает
  // и случай «кончилась квота ORS», и случай «ключ не задан» — по улицам
  // всё равно посчитаем, прямая линия остаётся последним средством.
  const osrm = async () => {
    const path = points.map((p) => `${p.lon},${p.lat}`).join(';')
    for (const base of ['https://routing.openstreetmap.de/routed-car', 'https://router.project-osrm.org']) {
      try {
        const res = await fetch(`${base}/route/v1/driving/${path}?overview=full&geometries=geojson`, {
          signal: AbortSignal.timeout(9000),
        })
        if (!res.ok) continue
        const data = await res.json()
        const r = data?.routes?.[0]
        const coords = r?.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) continue
        const km = (m: number) => Math.round(m / 100) / 10
        return {
          approx: false,
          coords,
          legs: (r.legs ?? []).map((l: { distance: number; duration: number }) => ({
            km: km(l.distance), min: Math.round(l.duration / 60),
          })),
          total: { km: km(r.distance ?? 0), min: Math.round((r.duration ?? 0) / 60) },
        }
      } catch (e) {
        console.error('osrm', base, String(e).slice(0, 120))
      }
    }
    return null
  }

  const fallback = async () => {
    const road = await osrm()
    return new Response(JSON.stringify(road ?? straight()), {
      headers: { 'Content-Type': 'application/json', ...cors(origin) },
    })
  }

  if (!key) return await fallback()

  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lon, p.lat]) }),
    })
    if (!res.ok) {
      console.error('ors', res.status, (await res.text()).slice(0, 300))
      return await fallback()
    }
    const data = await res.json()
    const feat = data.features?.[0]
    const segs = feat?.properties?.segments ?? []
    const legs = segs.map((s: { distance: number; duration: number }) => ({
      km: Math.round((s.distance / 1000) * 10) / 10,
      min: Math.round(s.duration / 60),
    }))
    return new Response(JSON.stringify({
      approx: false,
      coords: feat?.geometry?.coordinates ?? points.map((p) => [p.lon, p.lat]),
      legs,
      total: {
        km: Math.round((feat?.properties?.summary?.distance ?? 0) / 100) / 10,
        min: Math.round((feat?.properties?.summary?.duration ?? 0) / 60),
      },
    }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } })
  } catch (e) {
    console.error('ors fetch', String(e).slice(0, 200))
    return await fallback()
  }
})
