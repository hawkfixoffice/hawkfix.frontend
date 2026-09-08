import type { Block } from './types'

export interface Section {
  heading: string
  /** Короткая подпись над заголовком — в старой вёрстке это был отдельный абзац. */
  eyebrow?: string
  paras: string[]
  lists: string[][]
}

/** Короткий абзац без завершающей точки — это подпись секции, а не текст. */
const isEyebrow = (t: string) => t.length <= 34 && !/[.!?…:]$/.test(t)

/**
 * Режет плоский поток блоков страницы на секции по заголовкам h2/h3.
 * Нужно, чтобы разложить готовый текст старого сайта по блочной вёрстке,
 * не сочиняя новых подписей.
 */
export function toSections(blocks: Block[]): Section[] {
  const out: Section[] = []
  let cur: Section = { heading: '', paras: [], lists: [] }
  let pendingEyebrow: string | undefined

  const flush = () => {
    if (cur.heading || cur.paras.length || cur.lists.length) out.push(cur)
  }

  for (const b of blocks) {
    if (b.type === 'h2' || b.type === 'h3') {
      flush()
      cur = { heading: b.text, eyebrow: pendingEyebrow, paras: [], lists: [] }
      pendingEyebrow = undefined
    } else if (b.type === 'p') {
      if (b.text.length <= 2) continue
      if (isEyebrow(b.text)) {
        // Придержим: если дальше идёт заголовок — это его подпись,
        // если нет — вернём как обычный абзац, чтобы текст не пропал.
        if (pendingEyebrow) cur.paras.push(pendingEyebrow)
        pendingEyebrow = b.text
      } else {
        if (pendingEyebrow) { cur.paras.push(pendingEyebrow); pendingEyebrow = undefined }
        cur.paras.push(b.text)
      }
    } else if (b.type === 'list') {
      if (pendingEyebrow) { cur.eyebrow ??= pendingEyebrow; pendingEyebrow = undefined }
      cur.lists.push(b.items)
    }
  }
  if (pendingEyebrow) cur.paras.push(pendingEyebrow)
  flush()
  return out
}

/** Список пар «вопрос/ответ»: чётные элементы короче нечётных. */
export function isQaList(items: string[]): boolean {
  if (items.length < 4 || items.length % 2) return false
  for (let i = 0; i < items.length; i += 2) {
    if (items[i + 1].length <= items[i].length) return false
  }
  return true
}
