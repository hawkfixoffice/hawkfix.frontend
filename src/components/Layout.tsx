import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Locale, PageRec } from '../lib/types'
import { PageProvider, usePage } from './PageContext'
import Header from './Header'
import Footer from './Footer'
import CookieBanner from './CookieBanner'
import ClientOnly from './ClientOnly'
import CmsBoot from '../cms/CmsBoot'
import { detectLocale, isBot, onceThisSession, readPref } from '../lib/locale-pref'

function Shell({ children }: { children: React.ReactNode }) {
  const { t, page, locale } = usePage()
  const { pathname, hash, key } = useLocation()
  const navigate = useNavigate()

  // При загрузке подставляем язык устройства (или явный выбор пользователя),
  // если у этой страницы есть такая версия. Один раз за сессию, не для ботов.
  useEffect(() => {
    if (isBot() || !onceThisSession()) return
    const want = readPref() ?? detectLocale()
    if (!want || want === locale) return
    const to = page.paths[want]
    if (to) navigate(to + window.location.hash, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // При переходе между страницами возвращаем прокрутку наверх.
  // Если переход был сменой языка — проигрываем появление контента.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0)
    const html = document.documentElement
    if (html.getAttribute('data-langswitch') === 'out') {
      html.setAttribute('data-langswitch', 'in')
      const id = window.setTimeout(() => html.removeAttribute('data-langswitch'), 500)
      return () => window.clearTimeout(id)
    }
  }, [pathname])

  // Якорь в ссылке роутера («/#wycena») браузер сам не отрабатывает: переход
  // идёт без перезагрузки. Прокручиваем сами; `key` меняется на каждом клике,
  // поэтому повторное нажатие той же кнопки тоже срабатывает.
  useEffect(() => {
    if (!hash) return
    let id = hash.slice(1)
    try { id = decodeURIComponent(id) } catch { /* оставляем как есть */ }
    const el = document.getElementById(id)
    if (!el) { window.scrollTo(0, 0); return }
    el.scrollIntoView()
    // При заходе по прямой ссылке блоки выше дорастают после гидрации, и
    // плавная прокрутка останавливается выше цели — доводим один раз.
    const again = window.setTimeout(() => {
      const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
      if (Math.abs(el.getBoundingClientRect().top - want) > 8) el.scrollIntoView()
    }, 700)
    return () => window.clearTimeout(again)
  }, [pathname, hash, key])

  return (
    <>
      <a className="skip" href="#main">{t.a11y.skip}</a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <ClientOnly><CookieBanner /></ClientOnly>
      <ClientOnly><CmsBoot /></ClientOnly>
    </>
  )
}

export default function Layout({ page, locale, children }: { page: PageRec; locale: Locale; children: React.ReactNode }) {
  return (
    <PageProvider page={page} locale={locale}>
      <Shell>{children}</Shell>
    </PageProvider>
  )
}
