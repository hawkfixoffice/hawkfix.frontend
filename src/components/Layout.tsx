import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Locale, PageRec } from '../lib/types'
import { PageProvider, usePage } from './PageContext'
import Header from './Header'
import Footer from './Footer'
import CookieBanner from './CookieBanner'
import ClientOnly from './ClientOnly'
import { detectLocale, isBot, onceThisSession, readPref } from '../lib/locale-pref'

function Shell({ children }: { children: React.ReactNode }) {
  const { t, page, locale } = usePage()
  const { pathname } = useLocation()
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
    window.scrollTo(0, 0)
    const html = document.documentElement
    if (html.getAttribute('data-langswitch') === 'out') {
      html.setAttribute('data-langswitch', 'in')
      const id = window.setTimeout(() => html.removeAttribute('data-langswitch'), 500)
      return () => window.clearTimeout(id)
    }
  }, [pathname])

  return (
    <>
      <a className="skip" href="#main">{t.a11y.skip}</a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <ClientOnly><CookieBanner /></ClientOnly>
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
