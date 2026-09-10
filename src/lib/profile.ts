/** Что сайт помнит о человеке на его устройстве.
 *  Только удобство: имя подставляется в форму и здоровается над поиском.
 *  Ничего из этого никуда не уходит — данные лежат в localStorage браузера
 *  и стираются вместе с данными сайта. */

const KEY = 'hawkfix.client'

export interface ClientProfile {
  name: string
  phone?: string
  email?: string
  address?: string
}

export function readProfile(): ClientProfile | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as ClientProfile
    return p && typeof p.name === 'string' && p.name.trim() ? p : null
  } catch {
    // приватный режим или заблокированные данные сайта — просто не помним
    return null
  }
}

export function saveProfile(p: ClientProfile): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (!p.name.trim()) return
    localStorage.setItem(KEY, JSON.stringify({ ...p, name: p.name.trim().slice(0, 60) }))
  } catch { /* не помним — не беда */ }
}

export function forgetProfile(): void {
  try { localStorage.removeItem(KEY) } catch { /* нечего забывать */ }
}

/** Только имя, без фамилии: в приветствии длинная строка выглядит казённо. */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? ''
