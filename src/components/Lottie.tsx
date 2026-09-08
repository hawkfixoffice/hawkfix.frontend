import { useEffect, useRef, useState } from 'react'

type Name = 'check' | 'dots'

const SOURCES: Record<Name, () => Promise<{ default: object }>> = {
  check: () => import('../lottie/check.json'),
  dots: () => import('../lottie/dots.json'),
}

interface Props {
  name: Name
  size?: number
  loop?: boolean
  className?: string
  /** Чем заменить анимацию при «уменьшить движение» */
  still?: React.ReactNode
}

/**
 * Проигрывает Lottie-анимацию.
 *
 * Плеер берём напрямую из lottie-web в облегчённой сборке (lottie_light,
 * ~164 КБ) — обёртка lottie-react тянет барр-модуль с полным плеером на 740 КБ,
 * а нашим анимациям (шейпы + trim path) выражения и эффекты не нужны.
 * Грузится динамически: в основной бандл ничего из этого не попадает.
 */
export default function Lottie({ name, size = 64, loop = false, className, still }: Props) {
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
    if (reduced || !box.current) return
    let anim: { destroy: () => void } | null = null
    let alive = true

    Promise.all([
      import('lottie-web/build/player/lottie_light.min.js'),
      SOURCES[name](),
    ]).then(([mod, data]) => {
      if (!alive || !box.current) return
      const lottie = mod.default
      anim = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop,
        autoplay: true,
        animationData: data.default,
      })
    })

    return () => { alive = false; anim?.destroy() }
  }, [name, loop, reduced])

  if (reduced) return <>{still ?? null}</>

  return (
    <span
      ref={box} className={className} aria-hidden="true"
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
