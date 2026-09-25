import { useEffect, useState } from 'react'
import type { Group, PriceItem, Subgroup } from './types'
import { groups as bakedGroups, items as bakedItems, subgroups as bakedSubgroups } from '../data/content'
import { SUPA_URL, anonHeaders } from './supa'

export interface Catalog { items: PriceItem[]; groups: Group[]; subgroups: Subgroup[] }

const baked: Catalog = { items: bakedItems, groups: bakedGroups, subgroups: bakedSubgroups }

/** Один запрос на страницу, сколько бы калькуляторов на ней ни было. */
let pending: Promise<Catalog | null> | null = null
let fresh: Catalog | null = null

function fetchCatalog(): Promise<Catalog | null> {
  pending ??= fetch(`${SUPA_URL}/rest/v1/rpc/catalog`, {
    method: 'POST',
    headers: { ...anonHeaders, 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((c: Catalog | null) => {
      if (c && Array.isArray(c.items) && c.items.length) fresh = c
      return fresh
    })
    .catch(() => null)
  return pending
}

/**
 * Прайс для калькулятора. Сначала — запечённый в сборку (с ним совпадает
 * статический HTML, гидрация не разъезжается), затем — живой из базы.
 * Так правка цены в панели видна клиенту сразу, без пересборки сайта.
 * Базы не видно — остаётся запечённый, калькулятор работает как раньше.
 */
export function useCatalog(): Catalog {
  const [c, setC] = useState<Catalog>(baked)
  useEffect(() => {
    if (fresh) { setC(fresh); return }
    let alive = true
    fetchCatalog().then((live) => { if (alive && live) setC(live) })
    return () => { alive = false }
  }, [])
  return c
}
