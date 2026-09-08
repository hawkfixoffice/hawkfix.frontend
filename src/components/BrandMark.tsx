import { useEffect, useRef } from 'react'

const EVERY_MS = 10_000

/**
 * Логотип HAWK.FIX: точка между словами — Lottie. Раз в 10 секунд точка
 * раскрывается в звёздочку из референса, прокручивается и возвращается.
 * До загрузки плеера и при «уменьшить движение» — обычная статичная точка.
 */
export default function BrandMark() {
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let anim: { goToAndPlay: (f: number, isFrame?: boolean) => void; destroy: () => void } | null = null
    let timer = 0
    let alive = true
    Promise.all([
      import('lottie-web/build/player/lottie_light.min.js'),
      import('../lottie/logo.json'),
    ]).then(([mod, data]) => {
      if (!alive || !box.current) return
      el.classList.add('brand__dot--live')
      anim = mod.default.loadAnimation({
        container: el, renderer: 'svg', loop: false, autoplay: false, animationData: data.default,
      })
      const play = () => { if (document.visibilityState === 'visible') anim?.goToAndPlay(0, true) }
      timer = window.setTimeout(() => { play(); timer = window.setInterval(play, EVERY_MS) }, 1800)
    })
    return () => { alive = false; window.clearTimeout(timer); window.clearInterval(timer); anim?.destroy() }
  }, [])

  return (
    <>
      HAWK<span className="brand__dot" ref={box} aria-hidden="true">.</span>FIX
    </>
  )
}
