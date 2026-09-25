import { createElement, useEffect, useRef } from 'react'
import { cms, hasTags, pickDraft, sanitize, useCms } from './store'
import { useLoaderData } from 'react-router-dom'
import type { PageBody } from '../lib/types'
import { usePage } from '../components/PageContext'
import { UI } from '../lib/ui'

type Tag = 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'small' | 'b' | 'div' | 'li'

interface Props {
  /** Ключ места: `ui:hero.tagline`, `page:o-nas:b.3` … */
  k: string
  /** Исходный текст — что показываем, пока правки нет. */
  v: string
  as?: Tag
  className?: string
  id?: string
  /** Разрешить перенос строки (Enter). В заголовках Enter завершает правку. */
  multiline?: boolean
}

/**
 * Текст, который администратор правит прямо на странице.
 *
 * Посетитель видит обычный элемент: правку с этого языка или исходный текст,
 * форматирование (жирный, цвет, размер) — очищенным HTML. В режиме правки
 * тот же элемент становится contentEditable; при выделении фрагмента над ним
 * появляется панель стилей (src/cms/Toolbar.tsx), сохранение — по уходу фокуса.
 */
export default function E({ k, v, as = 'span', className, id, multiline = false }: Props) {
  const { locale } = usePage()
  const st = useCms()
  const { ov } = st
  // Правим только польскую версию: остальные языки получаются переводом при публикации
  const editing = st.editing && locale === 'pl'
  const val = st.admin ? pickDraft(st, locale, k, v) : pickDraft({ ...st, drafts: {} }, locale, k, v)
  const isDraft = st.admin && locale === 'pl' && !!st.drafts[k]
  const html = val.k === 'html' || hasTags(val.v)
  const ref = useRef<HTMLElement>(null)

  // В режиме правки содержимое кладём руками: React не должен
  // перерисовывать узел, пока в нём стоит курсор.
  useEffect(() => {
    const el = ref.current
    if (!editing || !el || document.activeElement === el) return
    if (html) el.innerHTML = sanitize(val.v); else el.textContent = val.v
  }, [editing, val.v, html])

  if (!editing) {
    return html
      ? createElement(as, { className, id, dangerouslySetInnerHTML: { __html: sanitize(val.v) } })
      : createElement(as, { className, id }, val.v)
  }

  const commit = (el: HTMLElement) => {
    const raw = sanitize(el.innerHTML).replace(/(<br>)+$/, '')
    const text = el.textContent ?? ''
    const isHtml = hasTags(raw)
    const next = isHtml ? raw : text
    if (next === val.v) return
    // Пустое поле = вернуть исходный текст, а не стереть надпись на сайте
    if (!text.trim()) { void cms.actions?.revert(k); return }
    void cms.actions?.saveText(k, next, isHtml ? 'html' : 'text')
  }

  return createElement(as, {
    ref, className, id,
    'data-editable': '',
    'data-key': k,
    'data-locale': locale,
    'data-edited': ov[locale]?.[k] ? '' : undefined,
    'data-draft': isDraft ? '' : undefined,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: true,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
      if (e.key === 'Escape') {
        const el = e.currentTarget
        if (html) el.innerHTML = sanitize(val.v); else el.textContent = val.v
        el.blur()
      }
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => commit(e.currentTarget),
    // Ссылка вокруг текста в режиме правки не уводит со страницы
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() },
  })
}

/** Строка интерфейса по пути в UI: `<U k="hero.tagline" as="h1" />`. */
export function U({ k, ...rest }: Omit<Props, 'k' | 'v'> & { k: string }) {
  const { locale } = usePage()
  const v = String(getPath(UI[locale], k) ?? '')
  return <E k={`ui:${k}`} v={v} {...rest} />
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, p) => (o == null ? o : (o as Record<string, unknown>)[p]), obj)
}

/** FNV-1a: короткий стабильный хеш исходного текста. Одинаков при сборке
 *  и в браузере, не зависит от того, в какую секцию раскладка положила абзац. */
export function textHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Все тексты тела страницы в одном порядке. Структура страниц одинакова
 *  во всех языках (проверено на всех 35), поэтому номер текста в этом
 *  списке указывает на одно и то же место в pl / uk / ru / en — по нему
 *  польская правка находит, куда положить перевод. */
export function flatTexts(b: PageBody | undefined): string[] {
  if (!b) return []
  const out: string[] = []
  for (const x of b.blocks ?? []) {
    if (x.type === 'list') out.push(...x.items)
    else if (x.type !== 'image') out.push(x.text)
  }
  for (const k of ['checklist', 'intro', 'note'] as const) out.push(...(b[k] ?? []))
  return out
}

/** Текст тела текущей страницы: `<PT v={абзац} as="p" />`.
 *  Ключ — `page:<страница>:n<номер текста>`; если текст не нашёлся в теле
 *  (собран раскладкой) — `t.<хеш>`, такой правится, но не переводится. */
export function PT({ v, field, ...rest }: Omit<Props, 'k'> & { field?: string }) {
  const { page } = usePage()
  const body = useLoaderData() as PageBody | undefined
  let k = `page:${page.key}:${field ?? ''}`
  if (!field) {
    const n = flatTexts(body).indexOf(v)
    k += n >= 0 ? `n${n}` : `t.${textHash(v)}`
  }
  return <E k={k} v={v} {...rest} />
}
