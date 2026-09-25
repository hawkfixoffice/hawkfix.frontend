import { createContext, useContext, useMemo } from 'react'
import type { Locale, PageRec } from '../lib/types'
import { UI, type UiStrings } from '../lib/ui'
import { plain, useCms, type Overrides } from '../cms/store'

interface Ctx { page: PageRec; locale: Locale; t: UiStrings }
const PageCtx = createContext<Ctx | null>(null)

/** Строки интерфейса с правками редактора. Отрисованные через <U> места
 *  показывают форматирование сами; здесь — простой текст для тех мест,
 *  где HTML не отрисовать (подписи кнопок, alt, aria-label). */
function withOverrides(base: UiStrings, ov: Overrides, locale: Locale): UiStrings {
  const mine = ov[locale]
  if (!mine) return base
  const keys = Object.keys(mine).filter((k) => k.startsWith('ui:'))
  if (!keys.length) return base
  const out = structuredClone(base) as unknown as Record<string, unknown>
  for (const k of keys) {
    const path = k.slice(3).split('.')
    let o = out as Record<string, unknown>
    for (let i = 0; i < path.length - 1 && o; i++) o = o[path[i]] as Record<string, unknown>
    const last = path[path.length - 1]
    if (o && typeof o[last] === 'string') o[last] = plain(mine[k].v)
  }
  return out as unknown as UiStrings
}

export function PageProvider({ page, locale, children }: { page: PageRec; locale: Locale; children: React.ReactNode }) {
  const { ov } = useCms()
  const t = useMemo(() => withOverrides(UI[locale], ov, locale), [ov, locale])
  return <PageCtx.Provider value={{ page, locale, t }}>{children}</PageCtx.Provider>
}

export function usePage(): Ctx {
  const v = useContext(PageCtx)
  if (!v) throw new Error('usePage вызван вне PageProvider')
  return v
}
