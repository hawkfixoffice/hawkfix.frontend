import { ViteReactSSG } from 'vite-react-ssg'
import type { RouteRecord } from 'vite-react-ssg'
import { routes as contentRoutes } from './data/content'
import { loadBody } from './data/bodies'
import Layout from './components/Layout'
import Seo from './seo/Seo'
import Home from './pages/Home'
import ServicesHub from './pages/ServicesHub'
import ServicePage from './pages/ServicePage'
import PricesPage from './pages/PricesPage'
import ContentPage from './pages/ContentPage'
import AboutPage from './pages/AboutPage'
import ContactPage from './pages/ContactPage'
import NotFound from './pages/NotFound'
import { buildSchema } from './seo/buildSchema'

import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/blocks.css'
import './styles/sections.css'
import './styles/content.css'

function view(type: string) {
  switch (type) {
    case 'home': return <Home />
    case 'services': return <ServicesHub />
    case 'service': return <ServicePage />
    case 'prices': return <PricesPage />
    case 'about': return <AboutPage />
    case 'contact': return <ContactPage />
    case 'legal': return <ContentPage narrow />
    default: return <ContentPage />
  }
}

/** Все 140 адресов перечислены явно: каждый получает собственный статический HTML
 *  со своей мета-разметкой. Никаких клиентских редиректов — так требует SEO. */
const pageRoutes: RouteRecord[] = contentRoutes.map(({ path, page, locale }) => ({
  path,
  // Тело страницы едет отдельным чанком: клиент грузит только текст открытого адреса
  loader: () => loadBody(page.key, locale),
  element: (
    <Layout page={page} locale={locale}>
      <Seo page={page} locale={locale} schema={buildSchema(page, locale)} />
      {view(page.type)}
    </Layout>
  ),
  entry: 'src/main.tsx',
}))

export const routes: RouteRecord[] = [
  ...pageRoutes,
  // Отдельный статический /404 — его postbuild кладёт в dist/404.html,
  // именно этот файл GitHub Pages отдаёт на неизвестный адрес.
  { path: '/404', element: <NotFound />, entry: 'src/main.tsx' },
  { path: '*', element: <NotFound />, entry: 'src/main.tsx' },
]

export const createRoot = ViteReactSSG({ routes })
