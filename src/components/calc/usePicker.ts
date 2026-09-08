import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Selection } from '../../lib/quote'

const DRAFT_KEY = 'hawkfix.draft'

export interface Draft { selection: Selection[]; urgent: boolean }

/** Выбор позиций + автосохранение черновика. Черновик читаем после монтирования,
 *  чтобы серверный HTML и первая отрисовка совпали. */
export function usePicker() {
  const [selection, setSelection] = useState<Selection[]>([])
  const [urgent, setUrgent] = useState(false)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as Draft
        if (Array.isArray(d.selection) && d.selection.length) {
          setSelection(d.selection)
          setUrgent(Boolean(d.urgent))
          setRestored(true)
        }
      }
    } catch { /* хранилище недоступно — работаем без черновика */ }
  }, [])

  useEffect(() => {
    try {
      if (selection.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ selection, urgent }))
      else localStorage.removeItem(DRAFT_KEY)
    } catch { /* пусто */ }
  }, [selection, urgent])

  const qtyOf = useCallback(
    (key: string) => selection.find((s) => s.key === key)?.qty ?? 0,
    [selection],
  )

  const setQty = useCallback((key: string, qty: number, min = 1, max = 99) => {
    setSelection((prev) => {
      const clamped = Math.max(0, Math.min(qty, max))
      const rest = prev.filter((s) => s.key !== key)
      if (clamped < min) return rest
      return [...rest, { key, qty: clamped }]
    })
  }, [])

  const add = useCallback((key: string, min = 1) => {
    setSelection((prev) => {
      const cur = prev.find((s) => s.key === key)
      if (cur) return prev.map((s) => (s.key === key ? { ...s, qty: s.qty + 1 } : s))
      return [...prev, { key, qty: Math.max(1, min) }]
    })
  }, [])

  const remove = useCallback((key: string) => {
    setSelection((prev) => prev.filter((s) => s.key !== key))
  }, [])

  const clear = useCallback(() => { setSelection([]); setUrgent(false); setRestored(false) }, [])

  const keys = useMemo(() => new Set(selection.map((s) => s.key)), [selection])

  return { selection, setSelection, urgent, setUrgent, qtyOf, setQty, add, remove, clear, keys, restored, dismissRestored: () => setRestored(false) }
}
