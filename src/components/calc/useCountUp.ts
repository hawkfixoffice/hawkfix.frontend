import { useEffect, useRef, useState } from 'react'

/**
 * Плавно доводит число до нового значения — сумма не «прыгает», а набегает.
 * При «уменьшить движение» ставит значение сразу.
 */
export function useCountUp(target: number, duration = 420): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') { setValue(target); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target); from.current = target; return
    }
    const start = performance.now()
    const a = from.current
    const b = target
    if (a === b) return

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // easeOutCubic — быстро стартует, мягко приходит
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(a + (b - a) * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else from.current = b
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return value
}
