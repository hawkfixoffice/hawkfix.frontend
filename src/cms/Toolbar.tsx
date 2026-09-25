import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cms, hasTags, sanitize } from './store'

/**
 * Плавающая панель стилей, как в редакторе FRA Strona: появляется над
 * выделением внутри редактируемого текста и даёт жирный, курсив,
 * подчёркивание, зачёркивание, размер, цвет, выравнивание, очистку и
 * возврат исходного текста. Результат сохраняется как очищенный HTML
 * в правке этого места.
 */
const SIZES: [string, string][] = [['S', '0.85em'], ['M', ''], ['L', '1.2em'], ['XL', '1.5em']]
/** Палитра из токенов сайта: мята, тёмно-зелёный, чёрный, белый, серый,
 *  зелёный для текста, тёмно-оранжевый. */
const COLORS = ['#6eefa0', '#1a4a2e', '#1c1c1c', '#ffffff', '#6b6b6b', '#146b3c', '#c43200']

export default function Toolbar() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [color, setColor] = useState('#1a4a2e')
  const bar = useRef<HTMLDivElement>(null)
  // Настоящая ширина панели: центр над выделением, но не за краем экрана
  const [w, setW] = useState(0)
  useLayoutEffect(() => { if (bar.current) setW(bar.current.offsetWidth) }, [pos?.x, pos?.y, target])

  useEffect(() => {
    const place = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (!bar.current?.contains(document.activeElement)) setPos(null)
        return
      }
      const range = sel.getRangeAt(0)
      let node: Node | null = range.commonAncestorContainer
      if (node && node.nodeType === 3) node = node.parentElement
      const el = (node as HTMLElement | null)?.closest?.('[data-editable]') as HTMLElement | null
      if (!el) { setPos(null); return }
      const r = range.getBoundingClientRect()
      setTarget(el)
      setPos({
        x: r.left + r.width / 2,
        y: r.top > 70 ? r.top - 52 : r.bottom + 12,
      })
    }
    document.addEventListener('selectionchange', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('selectionchange', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [])

  if (!pos || !target) return null
  const half = w / 2 + 8
  const left = w && window.innerWidth > w + 16
    ? Math.max(half, Math.min(window.innerWidth - half, pos.x))
    : window.innerWidth / 2

  const save = () => {
    const key = target.dataset.key
    if (!key) return
    const html = sanitize(target.innerHTML).replace(/(<br>)+$/, '')
    const isHtml = hasTags(html)
    const val = isHtml ? html : (target.textContent ?? '')
    if (val.trim()) void cms.actions?.saveText(key, val, isHtml ? 'html' : 'text')
  }
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    target.focus(); fn(); save()
  }
  // styleWithCSS: цвет и выделение приходят span со style, а не <font>,
  // который очистка выбрасывает вместе с цветом
  const exec = (cmd: string, val?: string) => {
    document.execCommand('styleWithCSS', false, 'true')
    return document.execCommand(cmd, false, val)
  }
  const wrapSize = (size: string) => {
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')   // метка, потом меняем <font> на span с настоящим размером
    target.querySelectorAll('font[size="7"]').forEach((f) => {
      const sp = document.createElement('span')
      if (size) sp.style.fontSize = size
      sp.innerHTML = f.innerHTML
      f.replaceWith(sp)
    })
  }
  const align = (a: string) => {
    const inner = target.innerHTML.replace(/<span style="text-align:[^"]*">|<\/span>$/g, '')
    target.innerHTML = `<span style="text-align:${a};display:block">${inner}</span>`
  }
  const clear = () => { exec('removeFormat'); target.innerHTML = target.textContent ?? '' }
  const revert = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const key = target.dataset.key
    if (key) void cms.actions?.revert(key)
    target.blur(); setPos(null)
  }

  return (
    <div
      ref={bar} className="cms-tb" style={{ left, top: pos.y }}
      onMouseDown={(e) => e.preventDefault()} role="toolbar" aria-label="Styl tekstu"
    >
      <button type="button" title="Pogrubienie" onMouseDown={run(() => exec('bold'))}><b>B</b></button>
      <button type="button" title="Kursywa" onMouseDown={run(() => exec('italic'))}><i>I</i></button>
      <button type="button" title="Podkreślenie" onMouseDown={run(() => exec('underline'))}><u>U</u></button>
      <button type="button" title="Przekreślenie" onMouseDown={run(() => exec('strikeThrough'))}><s>S</s></button>
      <span className="cms-tb__sep" />
      {SIZES.map(([l, v]) => (
        <button type="button" key={l} title={`Rozmiar ${l}`} className="cms-tb__sz" onMouseDown={run(() => wrapSize(v))}>{l}</button>
      ))}
      <span className="cms-tb__sep" />
      {COLORS.map((c) => (
        <button type="button" key={c} title={c} className="cms-tb__c" style={{ background: c }}
                onMouseDown={run(() => exec('foreColor', c))} />
      ))}
      <label className="cms-tb__pick" title="Własny kolor">
        <input type="color" value={color}
               onChange={(e) => { setColor(e.target.value); target.focus(); exec('foreColor', e.target.value); save() }} />
      </label>
      <button type="button" title="Zakreślacz" onMouseDown={run(() => exec('hiliteColor', '#dcf9e8'))}>▍</button>
      <span className="cms-tb__sep" />
      <button type="button" title="Do lewej" onMouseDown={run(() => align('left'))}>⇤</button>
      <button type="button" title="Środek" onMouseDown={run(() => align('center'))}>↔</button>
      <button type="button" title="Do prawej" onMouseDown={run(() => align('right'))}>⇥</button>
      <span className="cms-tb__sep" />
      <button type="button" title="Wyczyść formatowanie" onMouseDown={run(clear)}>✕</button>
      <button type="button" title="Przywróć oryginalny tekst" onMouseDown={revert}>↺</button>
    </div>
  )
}
