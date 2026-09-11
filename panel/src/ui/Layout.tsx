import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { signOut, type Me } from '../lib/supabase'
import { useT, LANGS } from '../lib/i18n'
import { useMasterPing, useOnlinePing } from '../lib/geo'
import Avatar from './Avatar'
import logo from '../assets/logo.svg'

/** Верхняя навигация: слева знак, по центру пилюли, справа язык и человек.
 *  На телефоне пилюли не помещаются — вместо них бургер, открывающий меню
 *  на весь экран. Набор пунктов зависит от роли: мастер не должен даже
 *  видеть финансы фирмы. */
export default function Layout({ me, children }: { me: Me; children: React.ReactNode }) {
  const { t, lang, setLang } = useT()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  // Телефон мастера раз в минуту сообщает, где он: это и карта, и подбор заказов
  useMasterPing(me)
  // А открытая вкладка — что человек на работе: из этого считается рабочее время
  useOnlinePing(me)

  // Меню закрывается само при переходе — иначе после нажатия пункта
  // страница меняется, а меню остаётся поверх неё
  useEffect(() => { setOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open])

  const tabs = [
    { to: '/', label: t('nav.dashboard'), end: true },
    { to: '/orders', label: t('nav.orders') },
    ...(me.role !== 'master' ? [{ to: '/clients', label: t('nav.crm') }] : []),
    ...(me.role === 'admin' ? [{ to: '/finance', label: t('nav.finance') }] : []),
    ...(me.role === 'admin' ? [{ to: '/reports', label: t('nav.reports') }] : []),
    ...(me.role !== 'master' ? [{ to: '/team', label: t('nav.team') }] : []),
    ...(me.role === 'admin' ? [{ to: '/settings', label: t('nav.settings') }] : []),
    { to: '/profile', label: t('nav.profile') },
  ]

  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brandmark" aria-label="HAWK.FIX">
          <img src={logo} alt="HAWK.FIX" height={22} />
        </Link>

        <nav className="tabs">
          {tabs.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.end}>{x.label}</NavLink>
          ))}
        </nav>

        <div className="topright">
          <div className="langpick">
            {LANGS.map((l) => (
              <button key={l} data-on={l === lang || undefined} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
          <button className="btn btn--ghost btn--sm topright__out" onClick={() => signOut()}>
            {t('nav.logout')}
          </button>
          <Link to="/profile" title={`${me.full_name} · ${me.role}`}>
            <Avatar name={me.full_name} path={me.avatar_path} />
          </Link>

          <button
            className="burger" aria-label={t('nav.menu')} aria-expanded={open}
            onClick={() => setOpen((v) => !v)} data-open={open || undefined}
          >
            <span />
          </button>
        </div>
      </header>

      {open && (
        <div className="mobmenu" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="mobmenu__head">
            <span className="split">
              <Avatar name={me.full_name} path={me.avatar_path} />
              <span>
                <b>{me.full_name}</b>
                <small className="muted" style={{ display: 'block' }}>{t(`team.${me.role}`)}</small>
              </span>
            </span>
            <button className="burger burger--onDark" aria-label={t('common.close')}
                    data-open onClick={() => setOpen(false)}><span /></button>
          </div>

          <nav className="mobmenu__nav">
            {tabs.map((x, i) => (
              <NavLink key={x.to} to={x.to} end={x.end}
                       style={{ animationDelay: `${40 + i * 35}ms` }}>
                {x.label}
              </NavLink>
            ))}
          </nav>

          <div className="mobmenu__foot">
            <div className="langpick langpick--onDark">
              {LANGS.map((l) => (
                <button key={l} data-on={l === lang || undefined} onClick={() => setLang(l)}>{l}</button>
              ))}
            </div>
            <button className="btn btn--primary" onClick={() => signOut()}>{t('nav.logout')}</button>
          </div>
        </div>
      )}

      <main className="page">{children}</main>
    </div>
  )
}
