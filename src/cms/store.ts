import { useSyncExternalStore } from 'react'
import bakedJson from '../../content/overrides.json'
import { SUPA_URL, anonHeaders } from '../lib/supa'

/**
 * Правки визуального редактора (таблица `site_content`).
 *
 *   ov[locale][key] = { v: значение, k: 'text' | 'html' | 'image' }
 *   locale '*' — фотографии, они общие для всех языков.
 *
 * Ключи:  ui:<путь в UI>         — строки интерфейса (src/lib/ui.ts)
 *         page:<страница>:<поле> — тексты страниц: h1, blurb, b.<n>, c.<n>…
 *         img:<имя фото>         — фотография
 *
 * При сборке правки запекаются в HTML (content/overrides.json), на живой
 * странице дочитываются свежие — правка видна сразу, без пересборки.
 */
export interface Ov { v: string; k: string }
export type Overrides = Record<string, Record<string, Ov>>

export interface CmsState {
  ov: Overrides
  /** Вошёл ли администратор (узнаём по сессии панели на этом же домене). */
  admin: boolean
  /** Включён ли режим правки. */
  editing: boolean
}

export interface CmsActions {
  saveText: (key: string, locale: string, value: string, kind: 'text' | 'html') => Promise<void>
  revert: (key: string, locale: string) => Promise<void>
  uploadImage: (name: string, file: File, onStage: (s: UploadStage) => void) => Promise<void>
}

export type UploadStage =
  | { stage: 'convert'; from: number }
  | { stage: 'upload'; from: number; to: number }
  | { stage: 'done'; from: number; to: number }
  | { stage: 'error'; error: string }

const baked = bakedJson as unknown as Overrides
const serverState: CmsState = { ov: baked, admin: false, editing: false }
let state: CmsState = serverState
const subs = new Set<() => void>()

function set(patch: Partial<CmsState>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const cms = {
  get: () => state,
  set,
  /** Действия появляются, когда загрузился модуль администратора. */
  actions: null as CmsActions | null,
  /** Точечная правка без перезагрузки всех правок. */
  put(locale: string, key: string, value: Ov | null) {
    const byLoc = { ...(state.ov[locale] ?? {}) }
    if (value) byLoc[key] = value; else delete byLoc[key]
    set({ ov: { ...state.ov, [locale]: byLoc } })
  },
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** Во время гидрации React берёт серверный снимок — он совпадает со
 *  статическим HTML. Живые правки приезжают следующим рендером. */
export function useCms(): CmsState {
  return useSyncExternalStore(subscribe, () => state, () => serverState)
}

let loaded = false
/** Дочитать свежие правки из базы. Один запрос на загрузку страницы. */
export function loadLiveOverrides() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  fetch(`${SUPA_URL}/rest/v1/site_content?select=key,locale,value,kind`, { headers: anonHeaders })
    .then((r) => (r.ok ? r.json() : null))
    .then((rows: { key: string; locale: string; value: string; kind: string }[] | null) => {
      if (!Array.isArray(rows)) return
      const ov: Overrides = {}
      for (const r of rows) (ov[r.locale] ??= {})[r.key] = { v: r.value, k: r.kind }
      set({ ov })
    })
    .catch(() => { /* база недоступна — остаются запечённые правки */ })
}

/** Значение по ключу: правка на этом языке или исходный текст. */
export function pick(ov: Overrides, locale: string, key: string, fallback: string): Ov {
  return ov[locale]?.[key] ?? { v: fallback, k: 'text' }
}

/* ------------------------------------------------------------------
   Очистка HTML. Работает строками, без DOM: страницы рендерятся при
   сборке в Node, где DOMParser нет. Пропускаем только разметку, которую
   даёт панель стилей: жирный, курсив, подчёркивание, зачёркивание,
   выделение, перенос строки и span со цветом/размером/выравниванием.
   ------------------------------------------------------------------ */
const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'mark', 'span', 'br', 'small', 'sup', 'sub'])
const STYLE_OK = /^(color|background-color|font-size|font-weight|font-style|text-decoration|text-decoration-line|text-align|letter-spacing|text-transform|display)$/i

function cleanStyle(style: string): string {
  return style.split(';').map((d) => d.trim()).filter(Boolean).filter((d) => {
    const i = d.indexOf(':')
    if (i < 0) return false
    const prop = d.slice(0, i).trim()
    const val = d.slice(i + 1).trim()
    // никаких url(), expression() и кавычек внутри значения
    if (prop.toLowerCase() === 'display') return val === 'block'
    return STYLE_OK.test(prop) && /^[#(),.%\w\s-]+$/.test(val) && !/url|expression/i.test(val)
  }).join('; ')
}

export function sanitize(html: string): string {
  if (!html || !/[<>&]/.test(html)) return html ?? ''
  const out: string[] = []
  const open: string[] = []
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|(<)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) { out.push(m[3].replace(/>/g, '&gt;')); continue }
    if (m[4] !== undefined) { out.push('&lt;'); continue }
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    if (!TAGS.has(tag)) {
      // div/p от contentEditable превращаем в перенос строки, остальное выбрасываем
      if (!closing && (tag === 'div' || tag === 'p') && out.length) out.push('<br>')
      continue
    }
    if (tag === 'br') { out.push('<br>'); continue }
    if (closing) {
      const at = open.lastIndexOf(tag)
      if (at < 0) continue
      while (open.length > at) out.push(`</${open.pop()}>`)
      continue
    }
    const style = /style\s*=\s*"([^"]*)"/i.exec(m[2])?.[1] ?? /style\s*=\s*'([^']*)'/i.exec(m[2])?.[1]
    const clean = style ? cleanStyle(style) : ''
    out.push(clean ? `<${tag} style="${clean.replace(/"/g, '')}">` : `<${tag}>`)
    open.push(tag)
  }
  while (open.length) out.push(`</${open.pop()}>`)
  return out.join('')
}

export const hasTags = (s: string) => /<\/?[a-z][^>]*>/i.test(s)
/** Текст без разметки — для мест, где HTML не отрисовать (aria-label, alt). */
export const plain = (s: string) =>
  s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
