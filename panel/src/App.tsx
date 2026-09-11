import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { sb, type Me } from './lib/supabase'
import { LangContext, readLang, type Lang } from './lib/i18n'
import Layout from './ui/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientCard from './pages/ClientCard'
import Orders from './pages/Orders'
import OrderCard from './pages/OrderCard'
import Finance from './pages/Finance'
import Team from './pages/Team'
import StaffCard from './pages/StaffCard'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Reports from './pages/Reports'

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)
  const [lang, setLangState] = useState<Lang>('pl')
  const loc = useLocation()

  useEffect(() => { setLangState(readLang()) }, [])
  const setLang = (l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('hawkfix.panel.lang', l) } catch { /* приватный режим */ }
  }

  // Кто вошёл. Роль читаем из таблицы staff, а не из метаданных токена:
  // метаданные пользователь теоретически может себе поменять, таблицу — нет.
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { if (alive) { setMe(null); setReady(true) } ; return }
      const { data } = await sb.from('staff').select('*').eq('id', session.user.id).maybeSingle()
      if (alive) { setMe((data as Me) ?? null); setReady(true) }
    }
    load()
    const { data: sub } = sb.auth.onAuthStateChange(() => load())
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const ctx = useMemo(() => ({ lang, setLang }), [lang])

  if (!ready) {
    return <div className="login"><div className="spin" /></div>
  }

  return (
    <LangContext.Provider value={ctx}>
      {!me ? (
        <Login />
      ) : (
        <Layout me={me}>
          <Routes>
            <Route path="/" element={<Dashboard me={me} />} />
            <Route path="/orders" element={<Orders me={me} />} />
            <Route path="/orders/:id" element={<OrderCard me={me} />} />
            <Route path="/profile" element={<Profile me={me} />} />
            {me.role !== 'master' && <Route path="/clients" element={<Clients me={me} />} />}
            {me.role !== 'master' && <Route path="/clients/:id" element={<ClientCard me={me} />} />}
            {me.role === 'admin' && <Route path="/finance" element={<Finance />} />}
            {me.role === 'admin' && <Route path="/reports" element={<Reports me={me} />} />}
            {me.role !== 'master' && <Route path="/team" element={<Team me={me} />} />}
            {me.role !== 'master' && <Route path="/team/:id" element={<StaffCard me={me} />} />}
            {me.role === 'admin' && <Route path="/settings" element={<Settings />} />}
            <Route path="*" element={<Navigate to="/" replace state={{ from: loc.pathname }} />} />
          </Routes>
        </Layout>
      )}
    </LangContext.Provider>
  )
}
