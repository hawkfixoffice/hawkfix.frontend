import { useEffect, useState } from 'react'

/** Рендерит детей только после монтирования — для всего, что зависит от
 *  localStorage или размеров окна. Иначе HTML из SSG разойдётся с гидратацией. */
export default function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return <>{ready ? children : fallback}</>
}
