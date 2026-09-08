import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Появление при прокрутке. Один общий IntersectionObserver на страницу —
 * дешевле, чем наблюдатель на каждый блок.
 *
 * Элемент помечается `data-reveal`, при попадании в область видимости
 * переключается в `data-reveal="in"`. Всё движение описано в CSS, поэтому
 * `prefers-reduced-motion` отключает его без участия JS.
 */
let observer: IntersectionObserver | null = null

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.setAttribute('data-reveal', 'in')
        observer?.unobserve(e.target)   // одноразово: назад не прячем
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  )
  return observer
}

interface Props {
  children: ReactNode
  /** Задержка каскада, мс */
  delay?: number
  as?: 'div' | 'section' | 'li' | 'article'
  className?: string
}

export default function Reveal({ children, delay = 0, as: Tag = 'div', className }: Props) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Если элемент уже виден при загрузке, показываем без ожидания наблюдателя
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.9) {
      el.setAttribute('data-reveal', 'in')
      return
    }
    const obs = getObserver()
    if (!obs) { el.setAttribute('data-reveal', 'in'); return }
    obs.observe(el)
    return () => obs.unobserve(el)
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={className}
      data-reveal=""
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}
