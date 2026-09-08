import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { Locale, PageRec } from '../lib/types'
import { PageProvider, usePage } from './PageContext'
import Header from './Header'
import Footer from './Footer'
import CookieBanner from './CookieBanner'
import ClientOnly from './ClientOnly'

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = usePage()
  const { pathname } = useLocation()

  // При переходе между страницами возвращаем прокрутку наверх и фокус в начало
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

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
