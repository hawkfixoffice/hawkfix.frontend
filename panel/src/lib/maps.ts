import { Map as MlMap, Marker, NavigationControl, type StyleSpecification, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Карта без Google и без ключей в браузере.
 *
 *  Тайлы — OpenFreeMap (бесплатно, без ключа, коммерческое использование
 *  разрешено при указании атрибуции). Адреса и магазины — Photon.
 *  Маршрут — наша edge-функция, в ней лежит ключ OpenRouteService.
 *
 *  Единственное обязательство перед OpenFreeMap — атрибуция; MapLibre
 *  добавляет её сам из стиля, поэтому контрол атрибуции не выключаем. */

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const ROUTE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://vpijumbbmwjibvlohfug.supabase.co')
  + '/functions/v1/route'

/** Запасные маршрутизаторы прямо из браузера: OSRM на данных OSM, без ключа
 *  и с `Access-Control-Allow-Origin: *`. Нужны потому, что у части людей
 *  (VPN, корпоративный DNS, блокировщик) запросы к `functions/v1` не уходят,
 *  хотя REST того же проекта работает: без этой ветки мастер видел прямую
 *  линию вместо дороги. Первый — сервер FOSSGIS (он же за картой osm.org),
 *  второй — демо-сервер проекта OSRM. */
const OSRM_BASES = [
  'https://routing.openstreetmap.de/routed-car',
  'https://router.project-osrm.org',
]

export const WARSAW = { lat: 52.2297, lon: 21.0122 }

/* ------------------------- фирменный вид карты ------------------------- */
const INK = '#1c1c1c', PAPER = '#f4f4f2', CARD = '#ffffff'
const ACCENT = '#6eefa0', FOREST = '#1a4a2e', WATER = '#cfe3d8', GREEN = '#dff0e4'

/** Перекрашиваем готовый стиль под панель: бумага вместо серого,
 *  приглушённая зелень, белые дороги, тёмные подписи. Правила по имени
 *  слоя, а не список из 111 штук — новые слои в стиле не сломают вид. */
function tint(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    const id = layer.id
    const l = layer as unknown as { paint?: Record<string, unknown>; layout?: Record<string, unknown>; type: string }
    l.paint ??= {}
    const paint = l.paint

    if (l.type === 'background') paint['background-color'] = PAPER
    else if (/water|ocean|sea|river/.test(id)) {
      if (l.type === 'fill') paint['fill-color'] = WATER
      if (l.type === 'line') paint['line-color'] = WATER
    }
    else if (/park|wood|forest|grass|golf|pitch|garden/.test(id)) paint['fill-color'] = GREEN
    else if (/building/.test(id)) {
      paint['fill-color'] = '#e7e7e4'
      paint['fill-outline-color'] = '#dcdcd8'
    }
    else if (/landuse|landcover|residential|sand|farmland/.test(id)) paint['fill-color'] = '#ececeb'
    else if (l.type === 'line' && /road|street|highway|bridge|tunnel|transportation/.test(id)) {
      paint['line-color'] = /motorway|trunk|primary/.test(id) ? '#e6e6e3' : CARD
    }
    else if (l.type === 'symbol') {
      paint['text-color'] = '#3a3a3a'
      paint['text-halo-color'] = '#ffffff'
      paint['text-halo-width'] = 1.4
    }
    // Пиктограммы POI на карте только шумят: адрес и магазины показываем
    // своими метками
    if (l.type === 'symbol' && /poi/.test(id)) l.layout = { ...(l.layout ?? {}), visibility: 'none' }
  }
  return style
}

let stylePromise: Promise<StyleSpecification> | null = null
const brandStyle = () => (stylePromise ??= fetch(STYLE_URL).then((r) => r.json()).then(tint))

/* ------------------------------- карта ------------------------------- */
export interface Pt { lat: number; lon: number }

export async function createMap(container: HTMLElement, center: Pt = WARSAW, zoom = 12): Promise<MlMap> {
  const style = await brandStyle()
  const map = new MlMap({
    container,
    style: (import.meta.env.VITE_MAP_RAW ? STYLE_URL : JSON.parse(JSON.stringify(style))) as StyleSpecification,
    center: [center.lon, center.lat],
    zoom,
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  // Для отладки в консоли браузера: window.__map
  ;(window as unknown as { __map?: unknown }).__map = map
  map.on('error', (e: unknown) => console.error('[map]', (e as { error?: Error }).error?.message ?? e))
  // Карточка могла появиться после создания карты (переход по маршруту,
  // раскрытие блока) — тогда MapLibre считает размер по старому боксу
  const ro = new ResizeObserver(() => map.resize())
  ro.observe(container)
  map.once('remove', () => ro.disconnect())
  return map
}

/** Метка в фирменных цветах: кружок с обводкой, внутри буква или цифра. */
export function marker(map: MlMap, p: Pt, opts: { color?: string; glyph?: string; title?: string } = {}) {
  const el = document.createElement('div')
  el.className = 'mapin'
  el.style.background = opts.color ?? ACCENT
  el.style.color = opts.color === FOREST || opts.color === INK ? '#ffffff' : INK
  el.textContent = opts.glyph ?? ''
  if (opts.title) el.title = opts.title
  return new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map)
}

const kmBetween = (a: Pt, b: Pt) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface RouteResult {
  approx: boolean
  /** Считали сами в браузере: до сервера маршрутов не достучались */
  offline?: boolean
  coords: [number, number][]
  legs: { km: number; min: number }[]
  total: { km: number; min: number }
}

/** Прямая линия — запасной маршрут, когда сервер недоступен.
 *  Средняя скорость по городу 28 км/ч: та же прикидка, что в функции. */
function straightRoute(points: Pt[]): RouteResult {
  const legs = points.slice(1).map((p, i) => {
    const km = kmBetween(points[i], p)
    return { km: Math.round(km * 10) / 10, min: Math.round((km / 28) * 60) }
  })
  return {
    approx: true,
    offline: true,
    coords: points.map((p) => [p.lon, p.lat] as [number, number]),
    legs,
    total: {
      km: Math.round(legs.reduce((a, l) => a + l.km, 0) * 10) / 10,
      min: legs.reduce((a, l) => a + l.min, 0),
    },
  }
}

/** Ответ OSRM → наш формат. Геометрия уже geojson, участки считаем по legs. */
async function osrmRoute(points: Pt[]): Promise<RouteResult | null> {
  const path = points.map((p) => `${p.lon},${p.lat}`).join(';')
  for (const base of OSRM_BASES) {
    try {
      const res = await fetch(`${base}/route/v1/driving/${path}?overview=full&geometries=geojson`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const r = data?.routes?.[0]
      const coords = r?.geometry?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) continue
      const round1 = (m: number) => Math.round(m / 100) / 10
      return {
        approx: false,
        coords: coords as [number, number][],
        legs: (r.legs ?? []).map((l: { distance: number; duration: number }) => ({
          km: round1(l.distance), min: Math.round(l.duration / 60),
        })),
        total: { km: round1(r.distance ?? 0), min: Math.round((r.duration ?? 0) / 60) },
      }
    } catch { /* пробуем следующий сервер */ }
  }
  return null
}

/** Пока в этой вкладке функция маршрутов ни разу не ответила, больше её не
 *  ждём: незачем держать человека по десять секунд на каждом заказе. */
let routeFnDead = false

/** Маршрут: сначала наша функция (там ключ ORS и учёт пробок), если она
 *  недоступна — публичный OSRM прямо из браузера, и только в последнюю
 *  очередь прямая линия. Дорога по улицам должна быть почти всегда. */
export async function fetchRoute(from: Pt, to: Pt, via?: Pt | null): Promise<RouteResult> {
  const points = [from, ...(via ? [via] : []), to]
  const body = JSON.stringify({ from, to, via: via ?? null })

  if (!routeFnDead) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(ROUTE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) throw new Error(`route ${res.status}`)
        const out = (await res.json()) as RouteResult
        // Функция без ключа отвечает прямой линией — тогда лучше OSRM
        if (!out.approx) return out
        break
      } catch (e) {
        if (attempt === 1) {
          routeFnDead = true
          console.warn('[route] функция маршрутов недоступна, идём в OSRM:', (e as Error).message)
        }
      }
    }
  }

  const osrm = await osrmRoute(points)
  if (osrm) return osrm

  console.warn('[route] ни один маршрутизатор не ответил, считаем по прямой')
  return straightRoute(points)
}

/** Линия маршрута поверх карты; вид подгоняется под неё.
 *  Ждём готовности стиля сами: слой нельзя добавить, пока стиль не загружен,
 *  а маршрут часто приходит раньше тайлов. */
export function drawRoute(map: MlMap, coords: [number, number][], approx = false) {
  if (!map.isStyleLoaded()) {
    map.once('load', () => drawRoute(map, coords, approx))
    return
  }
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords },
  }
  const src = map.getSource('route') as GeoJSONSource | undefined
  if (src) src.setData(data)
  else {
    map.addSource('route', { type: 'geojson', data })
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': FOREST, 'line-width': 5, 'line-opacity': 0.9,
        // Пунктир — честная подсказка, что это прямая, а не дорога
        ...(approx ? { 'line-dasharray': [1.5, 1.2] } : {}),
      },
    })
  }

  const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1])
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, maxZoom: 15, duration: 400 },
  )
}

/* ------------------------- адреса и магазины ------------------------- */
interface Feature {
  properties: Record<string, string | undefined>
  geometry: { coordinates: [number, number] }
}

const photon = (params: Record<string, string>) => {
  const u = new URL('https://photon.komoot.io/api/')
  // lang=default обязателен: иначе Photon смотрит на язык браузера
  // и отдаёт «Warsaw» вместо «Warszawa»
  u.searchParams.set('lang', 'default')
  Object.entries(params).forEach(([k, v]) => u.searchParams.append(k, v))
  return fetch(u.toString()).then((r) => r.json())
}

/** Адрес → координаты. Запрос смещён к Варшаве, поэтому одноимённые
 *  улицы в других воеводствах не перебивают столичные. */
export async function geocode(address: string): Promise<Pt | null> {
  const data = await photon({
    q: `${address}, Warszawa`, lat: String(WARSAW.lat), lon: String(WARSAW.lon), limit: '1',
  })
  const f: Feature | undefined = data.features?.[0]
  if (!f) return null
  const [lon, lat] = f.geometry.coordinates
  return { lat, lon }
}

export interface Shop {
  name: string
  address: string
  point: Pt
  km: number
}

/** Строительные магазины по дороге. Photon сортирует по релевантности,
 *  а не по расстоянию, поэтому берём прямоугольник вокруг маршрута
 *  (bbox) и считаем крюк: сколько лишних километров выйдет, если заехать.
 *  Отдельно спрашиваем сети — их названия ищутся надёжнее слова «budowlany». */
const CHAINS = ['Castorama', 'Leroy Merlin', 'OBI', 'PSB Mrówka', 'Bricomarché']

export async function shopsNear(from: Pt, to: Pt): Promise<Shop[]> {
  const pad = 0.06                                   // ~6 км запаса вокруг пути
  const bbox = [
    Math.min(from.lon, to.lon) - pad, Math.min(from.lat, to.lat) - pad,
    Math.max(from.lon, to.lon) + pad, Math.max(from.lat, to.lat) + pad,
  ].join(',')
  const mid = { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 }
  const direct = kmBetween(from, to)

  const queries = [
    { q: 'sklep budowlany', osm_tag: 'shop:doityourself' },
    { q: 'market budowlany', osm_tag: 'shop:hardware' },
    ...CHAINS.map((q) => ({ q })),
  ]

  const answers = await Promise.all(queries.map((params) =>
    photon({ ...params, lat: String(mid.lat), lon: String(mid.lon), limit: '10', bbox })
      .catch(() => ({ features: [] }))))

  const seen = new Set<string>()
  const out: Shop[] = []
  for (const data of answers) {
    for (const f of (data.features ?? []) as Feature[]) {
      const p = f.properties
      const kind = p.osm_value ?? ''
      // Отсекаем всё, что просто содержит слово «budowlany»: улицы,
      // институты, склады без магазина
      if (!['doityourself', 'hardware', 'trade', 'paint', 'retail'].includes(kind)) continue
      const name = p.name ?? ''
      const [lon, lat] = f.geometry.coordinates
      const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`
      if (!name || seen.has(key)) continue
      const point = { lat, lon }
      // Крюк: насколько длиннее станет путь, если заехать сюда
      const detour = kmBetween(from, point) + kmBetween(point, to) - direct
      if (detour > 8) continue
      seen.add(key)
      out.push({
        name,
        address: [p.street, p.housenumber, p.city].filter(Boolean).join(' '),
        point,
        km: Math.round(Math.max(detour, 0) * 10) / 10,
      })
    }
  }
  return out.sort((x, y) => x.km - y.km).slice(0, 6)
}

/** Ссылка в навигатор телефона: маршрут строит он сам, ключей не нужно. */
export const navLink = (to: Pt, address?: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${
    address ? encodeURIComponent(`${address}, Warszawa`) : `${to.lat},${to.lon}`}&travelmode=driving`

export { INK, ACCENT, FOREST }
