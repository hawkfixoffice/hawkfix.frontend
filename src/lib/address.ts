/** Подсказки адреса из OpenStreetMap через Photon (komoot).
 *  Почему Photon, а не Nominatim: отдаёт `Access-Control-Allow-Origin: *`,
 *  не требует ключа и не ограничивает частоту одним запросом в секунду —
 *  автодополнение на каждый набранный символ иначе невозможно.
 *
 *  «Проверка, существует ли адрес» = адрес выбран из ответа геокодера.
 *  Свободный текст не подтверждаем: улицы «Nieistniejąca 5» в OSM нет,
 *  и её отсутствие в подсказках — и есть ответ. */

import { CONTACT } from './ui'

/** Центр Варшавы — от него считаем зону выезда (город + 25 км). */
const CENTER = { lat: 52.2297, lon: 21.0122 }
/** Запас к радиусу: адрес чуть за границей показываем, но помечаем. */
const MAX_KM = CONTACT.radiusKm + 12

export interface AddressHit {
  /** Готовая строка для поля и для заявки */
  label: string
  street: string
  house: string
  city: string
  district: string
  postcode: string
  lat: number
  lon: number
  /** Расстояние от центра Варшавы — по нему видно выезд за зону */
  km: number
  /** Дом указан точно, а не только улица */
  exact: boolean
}

/** Расстояние по большому кругу, км. */
function distKm(lat: number, lon: number): number {
  const R = 6371
  const dLat = ((lat - CENTER.lat) * Math.PI) / 180
  const dLon = ((lon - CENTER.lon) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((CENTER.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

interface Feature {
  properties: Record<string, string | undefined>
  geometry: { coordinates: [number, number] }
}

function toHit(f: Feature): AddressHit | null {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  if (p.countrycode !== 'PL') return null

  // У здания название улицы лежит в street, у самой улицы — в name
  const street = p.street ?? p.name ?? ''
  const house = p.housenumber ?? ''
  const city = p.city ?? p.town ?? p.village ?? p.county ?? ''
  if (!street || !city) return null

  const km = distKm(lat, lon)
  if (km > MAX_KM) return null

  const line1 = [street, house].filter(Boolean).join(' ')
  const line2 = [p.postcode, city].filter(Boolean).join(' ')
  return {
    label: [line1, line2].filter(Boolean).join(', '),
    street, house, city,
    district: p.district ?? '',
    postcode: p.postcode ?? '',
    lat, lon, km,
    exact: Boolean(house),
  }
}

/** Подсказки адреса. Запрос смещён к Варшаве (`lat`/`lon`), поэтому
 *  «Marszałkowska 10» находит столичную улицу, а не одноимённую
 *  в другом воеводстве. */
export async function searchAddress(q: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const query = q.trim()
  if (query.length < 3) return []

  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('lat', String(CENTER.lat))
  url.searchParams.set('lon', String(CENTER.lon))
  url.searchParams.set('limit', '10')
  // Без явного lang Photon смотрит на Accept-Language браузера и у человека
  // с английской локалью отдаёт «Warsaw» и «South Praga» — такой адрес
  // уезжал в заявку и в письмо. `default` — это оригинальные названия OSM.
  url.searchParams.set('lang', 'default')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`photon ${res.status}`)
  const data = (await res.json()) as { features?: Feature[] }

  const hits: AddressHit[] = []
  const seen = new Set<string>()
  for (const f of data.features ?? []) {
    const hit = toHit(f)
    if (!hit || seen.has(hit.label)) continue
    seen.add(hit.label)
    hits.push(hit)
  }
  // Дом важнее улицы, ближе к центру — выше
  return hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.km - b.km).slice(0, 6)
}

/** Адрес вне зоны выезда — показываем, но предупреждаем. */
export const outOfZone = (h: AddressHit) => h.km > CONTACT.radiusKm
