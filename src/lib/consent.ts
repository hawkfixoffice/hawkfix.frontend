/** Согласие на cookie. Храним в localStorage, версионируем: если состав
 *  категорий изменится, поднимаем VERSION и спрашиваем заново. */
export const CONSENT_KEY = 'hawkfix.consent'
export const CONSENT_VERSION = 1

export interface Consent {
  v: number
  necessary: true          // всегда включены, отключить нельзя
  analytics: boolean
  at: string               // ISO-дата — понадобится, если спросят доказательство согласия
}

export function readConsent(): Consent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Consent
    if (c?.v !== CONSENT_VERSION) return null
    return c
  } catch {
    return null            // приватный режим или заблокированное хранилище
  }
}

export function writeConsent(analytics: boolean): Consent {
  const c: Consent = { v: CONSENT_VERSION, necessary: true, analytics, at: new Date().toISOString() }
  try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(c)) } catch { /* хранилище недоступно */ }
  window.dispatchEvent(new CustomEvent('hawkfix:consent', { detail: c }))
  return c
}

export function clearConsent() {
  try { window.localStorage.removeItem(CONSENT_KEY) } catch { /* пусто */ }
  window.dispatchEvent(new CustomEvent('hawkfix:consent-reset'))
}

/** Событие, по которому баннер можно открыть заново (ссылка «Ustawienia cookies»). */
export const REOPEN_EVENT = 'hawkfix:consent-open'
export function openConsentSettings() {
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT))
}
