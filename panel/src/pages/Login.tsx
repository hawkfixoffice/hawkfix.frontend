import { useState } from 'react'
import { signIn } from '../lib/supabase'
import { useT, LANGS } from '../lib/i18n'
import logo from '../assets/logo.svg'

export default function Login() {
  const { t, lang, setLang } = useT()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setBad(false)
    try { await signIn(u, p) } catch { setBad(true) } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="login__box" onSubmit={submit}>
        <img src={logo} alt="HAWK.FIX" height={26} style={{ justifySelf: 'start' }} />
        <h1 className="login__title">{t('login.title')}</h1>

        <div className="field">
          <label htmlFor="u">{t('login.user')}</label>
          <input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="p">{t('login.pass')}</label>
          <input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        </div>

        {bad && <p className="err">{t('login.bad')}</p>}

        <button className="btn btn--primary" disabled={busy || !u || !p}>
          {busy ? <span className="spin" /> : t('login.go')}
        </button>

        <div className="langpick" style={{ justifySelf: 'center' }}>
          {LANGS.map((l) => (
            <button key={l} type="button" data-on={l === lang || undefined} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
      </form>
    </div>
  )
}
