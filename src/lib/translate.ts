/**
 * Перевод при публикации: польский текст → uk / ru / en.
 *
 * Общий для сайта (визуальный редактор) и панели (прайс). Сама модель
 * вызывается edge-функцией `translate` — здесь только нарезка на пакеты
 * и счёт прогресса для окна публикации.
 */
export type Target = 'uk' | 'ru' | 'en'
export const TARGETS: Target[] = ['uk', 'ru', 'en']
export const TARGET_NAME: Record<Target, string> = { uk: 'Українська', ru: 'Русский', en: 'English' }

export type Invoke = (to: Target, texts: string[]) => Promise<string[]>

export interface Progress {
  stage: 'translate' | 'publish' | 'rebuild' | 'done' | 'error'
  done: Record<Target, number>
  total: number
  error?: string
}

/** Сколько строк в одном запросе к модели: 27b переводит пакет ~5–10 с. */
const BATCH = 12

export async function translateAll(
  texts: string[], invoke: Invoke, onProgress: (p: Record<Target, number>) => void,
): Promise<Record<Target, string[]>> {
  const done: Record<Target, number> = { uk: 0, ru: 0, en: 0 }
  const out = {} as Record<Target, string[]>
  // Языки параллельно, пакеты внутри языка — по очереди: модель одна,
  // три одновременных запроса она ещё держит, больше — уже очередь
  await Promise.all(TARGETS.map(async (to) => {
    const acc: string[] = []
    for (let i = 0; i < texts.length; i += BATCH) {
      const part = texts.slice(i, i + BATCH)
      acc.push(...await invoke(to, part))
      done[to] = acc.length
      onProgress({ ...done })
    }
    out[to] = acc
  }))
  return out
}

/** Понятная человеку причина сбоя перевода. */
export function translateError(code: string): string {
  if (/timeout/.test(code)) return 'Model tłumacząca nie odpowiedziała na czas. Spróbuj ponownie za chwilę.'
  if (/ai_5\d\d|Failed to fetch|ai_4\d\d/.test(code)) return 'Serwer tłumaczeń (Barabash AI) jest niedostępny. Sprawdź, czy Mac Studio działa, i spróbuj ponownie.'
  if (/forbidden/.test(code)) return 'Publikować może tylko administrator.'
  return `Tłumaczenie nie powiodło się: ${code}`
}
