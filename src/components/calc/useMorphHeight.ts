import { useLayoutEffect, useRef } from 'react'

/** Плавная смена высоты блока, содержимое которого меняется скачком.
 *
 *  Приём FLIP: перед сменой состояния зовём `capture()` (запоминает
 *  текущую высоту), после перерисовки хук проигрывает переход от старой
 *  высоты к новой. Так не нужно знать высоту заранее — а её и нельзя
 *  знать: шаги формы разной длины, а экран успеха вдвое короче формы.
 *
 *  Анимируем через WAAPI, а не CSS-переход: `height: auto` переходами
 *  не анимируется, а фиксировать высоту в стилях нельзя — контент
 *  внутри продолжает жить (список подсказок, ошибки полей). */
export function useMorphHeight<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null)
  const from = useRef<number | null>(null)

  const capture = () => {
    from.current = ref.current?.getBoundingClientRect().height ?? null
  }

  useLayoutEffect(() => {
    const el = ref.current
    const start = from.current
    from.current = null
    if (!el || start == null || typeof el.animate !== 'function') return
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const end = el.getBoundingClientRect().height
    if (Math.abs(end - start) < 4) return

    // На время перехода прячем то, что не влезает в промежуточную высоту
    const prevOverflow = el.style.overflow
    el.style.overflow = 'hidden'
    const anim = el.animate(
      [{ height: `${start}px` }, { height: `${end}px` }],
      { duration: 340, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    )
    anim.finished.catch(() => {}).finally(() => { el.style.overflow = prevOverflow })
    return () => anim.cancel()
  }, [dep])

  return { ref, capture }
}
