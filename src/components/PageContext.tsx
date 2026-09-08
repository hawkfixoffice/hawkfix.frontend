import { createContext, useContext } from 'react'
import type { Locale, PageRec } from '../lib/types'
import { UI, type UiStrings } from '../lib/ui'

interface Ctx { page: PageRec; locale: Locale; t: UiStrings }
const PageCtx = createContext<Ctx | null>(null)

export function PageProvider({ page, locale, children }: { page: PageRec; locale: Locale; children: React.ReactNode }) {
  return <PageCtx.Provider value={{ page, locale, t: UI[locale] }}>{children}</PageCtx.Provider>
}

export function usePage(): Ctx {
  const v = useContext(PageCtx)
  if (!v) throw new Error('usePage вызван вне PageProvider')
  return v
}
