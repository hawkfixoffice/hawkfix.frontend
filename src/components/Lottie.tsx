import { useEffect, useRef, useState, type ReactNode } from 'react'

type Name = 'check' | 'dots' | 'spark' | 'rule' | 'pulse'

const SOURCES: Record<Name, () => Promise<{ default: object }>> = {
  check: () => import('../lottie/check.json'),
  dots: () => import('../lottie/dots.json'),
  spark: () => import('../lottie/spark.json'),
  rule: () => import('../lottie/rule.json'),
  pulse: () => import('../lottie/pulse.json'),
}

/** Один наблюдатель на все анимации: сотня отдельных дешевле не станет. */
const watched = new Map<Element, (visible: boolean) => void>()
let io: IntersectionObserver | null = null

function watch(el: Element, cb: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') { cb(true); return () => {} }
  io ??= new IntersectionObserver(
    (entries) => { for (const e of entries) watched.get(e.target)?.(e.isIntersecting) },
    { rootMargin: '80px' },
  )
  watched.set(el, cb)
  io.observe(el)
  return () => { watched.delete(el); io?.unobserve(el) }
}

/** #rrggbb → [r, g, b, 1] в долях единицы, как хранит цвета Lottie. */
function toRgb(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

/** Перекрашивает все обводки и заливки копии анимации. */
function recolor(node: unknown, rgb: number[]): void {
  if (Array.isArray(node)) { for (const x of node) recolor(x, rgb); return }
  if (!node || typeof node !== 'object') return
  const o = node as Record<string, unknown>
  if ((o.ty === 'st' || o.ty === 'fl') && o.c && typeof o.c === 'object') {
    ;(o.c as Record<string, unknown>).a = 0
    ;(o.c as Record<string, unknown>).k = rgb
  }
  for (const v of Object.values(o)) recolor(v, rgb)
}

interface Props {
  name: Name
  /** Размер квадратной анимации. Для «линейных» задавайте width/height. */
  size?: number
  width?: number | string
  height?: number | string
  loop?: boolean
  /** Растянуть по ширине контейнера, игнорируя пропорции холста (для линии). */
  stretch?: boolean
  /** Перекрасить анимацию под фон: #rrggbb */
  color?: string
  /** Проиграть заново при наведении на ближайшего предка по селектору */
  hover?: string
  className?: string
  /** Чем заменить анимацию при «уменьшить движение» */
  still?: ReactNode
}

/**
 * Проигрывает Lottie-анимацию, когда она попала в поле зрения, и ставит на
 * паузу, когда ушла: фоновых кадров на странице не остаётся.
 *
 * Плеер берём напрямую из lottie-web в облегчённой сборке (lottie_light,
 * ~164 КБ) — обёртка lottie-react тянет барр-модуль с полным плеером на 740 КБ,
 * а нашим анимациям (шейпы + trim path) выражения и эффекты не нужны.
 * Грузится динамически: в основной бандл ничего из этого не попадает.
 */
export default function Lottie({
  name, size = 64, width, height, loop = false, stretch = false,
  color, hover, className, still,
}: Props) {
  const box = useRef<HTMLSpanElement>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    const el = box.current
    if (reduced || !el) return
    let anim: {
      play: () => void; pause: () => void; destroy: () => void
      goToAndPlay: (v: number, isFrame?: boolean) => void
    } | null = null
    let alive = true
    let played = false
    let unwatch = () => {}
    let unhover = () => {}

    Promise.all([
      import('lottie-web/build/player/lottie_light.min.js'),
      SOURCES[name](),
    ]).then(([mod, data]) => {
      if (!alive || !box.current) return
      // Копируем: модуль JSON кэшируется, красить оригинал нельзя
      const animationData = JSON.parse(JSON.stringify(data.default))
      if (color) recolor(animationData, toRgb(color))

      anim = mod.default.loadAnimation({
        container: el, renderer: 'svg', loop, autoplay: false, animationData,
        rendererSettings: stretch ? { preserveAspectRatio: 'none' } : undefined,
      })

      // Одноразовые играем при появлении в кадре, цикличные — пока видимы
      unwatch = watch(el, (visible) => {
        if (!anim) return
        if (!visible) { if (loop) anim.pause(); return }
        if (loop) anim.play()
        else if (!played) { played = true; anim.goToAndPlay(0, true) }
      })

      if (hover) {
        const host = el.closest(hover)
        if (host) {
          const replay = () => anim?.goToAndPlay(0, true)
          host.addEventListener('mouseenter', replay)
          host.addEventListener('focusin', replay)
          unhover = () => {
            host.removeEventListener('mouseenter', replay)
            host.removeEventListener('focusin', replay)
          }
        }
      }
    })

    return () => { alive = false; unwatch(); unhover(); anim?.destroy() }
  }, [name, loop, stretch, color, hover, reduced])

  if (reduced) return <>{still ?? null}</>

  return (
    <span
      ref={box} className={className} aria-hidden="true"
      style={{ width: width ?? size, height: height ?? size, display: 'block' }}
    />
  )
}
