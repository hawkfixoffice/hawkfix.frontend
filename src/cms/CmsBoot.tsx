import { lazy, Suspense, useEffect, useState } from 'react'
import { loadLiveOverrides } from './store'
import { PANEL_AUTH_KEY } from '../lib/supa'

const Admin = lazy(() => import('./Admin'))

/**
 * Живые правки и вход администратора.
 *
 * Всем: один запрос за свежими правками редактора.
 * Администратору: если в браузере лежит сессия панели (она на том же
 * домене, `/panel/`), подгружаем модуль редактора отдельным чанком.
 * Посетитель без сессии этот чанк не скачивает вовсе.
 */
export default function CmsBoot() {
  const [maybeAdmin, setMaybeAdmin] = useState(false)
  useEffect(() => {
    loadLiveOverrides()
    try { setMaybeAdmin(!!localStorage.getItem(PANEL_AUTH_KEY)) } catch { /* приватный режим */ }
  }, [])
  if (!maybeAdmin) return null
  return <Suspense fallback={null}><Admin /></Suspense>
}
