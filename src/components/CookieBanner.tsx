import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { KEY_PAGES, pathOf } from '../data/content'
import { REOPEN_EVENT, readConsent, writeConsent } from '../lib/consent'
import { usePage } from './PageContext'
import Icon from './Icon'

/**
 * Баннер согласия. Правила, которых держимся:
 *  — до выбора не грузим ничего необязательного;
 *  — «Только необходимые» такая же заметная кнопка, как «Принять все»;
 *  — выбор запоминается и его можно поменять позже (ссылка в подвале политики);
 *  — рендерим только на клиенте, иначе гидратация разойдётся с HTML.
 */
export default function CookieBanner() {
  const { locale, t } = usePage()
  const [show, setShow] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!readConsent()) setShow(true)
    const reopen = () => { setShow(true); setExpanded(true); setAnalytics(readConsent()?.analytics ?? false) }
    window.addEventListener(REOPEN_EVENT, reopen)
    return () => window.removeEventListener(REOPEN_EVENT, reopen)
  }, [])

  // Фокус уводим в баннер, чтобы клавиатурный пользователь его не проскочил
  useEffect(() => { if (show) ref.current?.focus() }, [show])

  if (!show) return null

  const decide = (a: boolean) => { writeConsent(a); setShow(false) }

  return (
    <div className="cookie">
      {/* Фокус ставим программно, чтобы объявил скринридер: рамка тут не нужна
          и на обёртке во всю ширину выглядела бы полосой через весь экран. */}
      <div
        className="cookie__box" role="dialog" aria-modal="false"
        aria-labelledby="cookie-title" tabIndex={-1} ref={ref}
      >
        <div className="cookie__head">
          <p className="label" id="cookie-title">{t.cookie.title}</p>
          <p className="cookie__text">{t.cookie.text}</p>
        </div>

        {expanded && (
          <div className="cookie__cats">
            <label className="cookie__cat cookie__cat--locked">
              <input type="checkbox" checked disabled />
              <span>
                <b>{t.cookie.necessary}</b>
                <small>{t.cookie.necessaryNote}</small>
              </span>
            </label>
            <label className="cookie__cat">
              <input
                type="checkbox" checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span>
                <b>{t.cookie.analytics}</b>
                <small>{t.cookie.analyticsNote}</small>
              </span>
            </label>
          </div>
        )}

        <div className="cookie__actions">
          {expanded ? (
            <button className="btn btn--primary" type="button" onClick={() => decide(analytics)}>
              {t.cookie.save}
            </button>
          ) : (
            <>
              <button className="btn btn--primary" type="button" onClick={() => decide(true)}>
                {t.cookie.accept}
              </button>
              {/* Отказ равнозначен согласию по заметности — требование EU */}
              <button className="btn btn--ghost" type="button" onClick={() => decide(false)}>
                {t.cookie.reject}
              </button>
              <button className="cookie__link" type="button" onClick={() => setExpanded(true)}>
                {t.cookie.settings}
              </button>
            </>
          )}
          <Link className="cookie__link" to={pathOf(KEY_PAGES.cookies, locale)}>
            {t.cookie.more} <Icon name="arrowUpRight" size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
