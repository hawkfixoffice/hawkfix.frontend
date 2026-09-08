import { Link } from 'react-router-dom'
import { KEY_PAGES, groups, items, pathOf, services, settings } from '../data/content'
import { faq } from '../data/faq'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import Accordion from '../components/Accordion'
import SparkDot from '../components/SparkDot'
import Rule from '../components/Rule'
import Calculator from '../components/calc/Calculator'
import { CONTACT, serviceAlt } from '../lib/ui'

/** У каждой группы прайса есть страница услуги — берём с неё фотографию и ссылку. */
const GROUP_SERVICE = Object.fromEntries(
  services.filter((s) => s.group).map((s) => [s.group as string, s]),
)

export default function Home() {
  const { locale, t } = usePage()
  const f = faq[locale]
  const cur = settings.currency

  const groupRows = groups
    .map((g) => {
      const list = items.filter((i) => i.group === g.key)
      return list.length ? { g, from: Math.min(...list.map((i) => i.price)), n: list.length } : null
    })
    .filter(Boolean) as { g: (typeof groups)[number]; from: number; n: number }[]

  const priceOf = (s: (typeof services)[number]) => {
    const list = s.group ? items.filter((i) => i.group === s.group) : []
    return list.length ? Math.min(...list.map((i) => i.price)) : null
  }

  const heroPanels = ['plumbing', 'renovation', 'moving']
    .map((img) => services.find((x) => x.image === img))
    .filter(Boolean) as typeof services
  const featured = services.slice(0, 3)
  const more = services.slice(3, 9)

  return (
    <>
      {/* ============================= ГЕРОЙ — слайд 1 ============================= */}
      <section className="herox">
        <div className="wrap">
          <div className="herox__box">
            <div className="herox__text">
              <span className="pill pill--outline">{t.hero.kicker}</span>
              <h1 className="herox__h1">{t.hero.tagline}</h1>
              <p className="herox__sub">{t.hero.sub}</p>
              <div className="herox__actions">
                <a className="btn btn--primary" href="#wycena">
                  {t.cta.quote} <Icon name="arrow" size={17} />
                </a>
                <a className="btn btn--onDark" href={CONTACT.phoneHref}>
                  <Icon name="phone" size={16} /> {CONTACT.phone}
                </a>
              </div>
            </div>

            <div className="herox__panels">
              {heroPanels.map((s, i) => (
                <div className="panel panel--mono herox__panel" key={s.key}>
                  <Picture
                    name={s.image!} alt={serviceAlt(s.tr[locale].h1)} ratio="3x2"
                    widths={[800, 1200, 1600]} sizes="(max-width: 900px) 34vw, 16vw" priority={i === 0}
                  />
                  {i === 1 && (
                    <Link className="badge badge--bl herox__badge" to={s.paths[locale]}>
                      <span className="badge__text">{t.cta.more}</span>
                      <span className="badge__dot"><SparkDot /></span>
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <a className="ring-btn herox__ring" href="#wycena" aria-label={t.cta.quote}>
              <Icon name="arrowDown" size={26} />
            </a>
          </div>

          <div className="herox__bottom">
            <div className="blk blk--accent">
              <p className="blk__t">{t.home.minVisitTitle} — {settings.minVisit} {cur}</p>
              <p className="blk__s">{t.home.minVisitNote}</p>
            </div>
            <div className="herox__spacer" aria-hidden="true" />
            <div className="blk blk--mute blk--center">
              <p className="blk__v blk__v--md">{items.length}</p>
              <p className="blk__s">{t.prices.positions}</p>
            </div>
            <div className="blk blk--forest">
              <p className="blk__t">{t.nav.services}: {services.length}</p>
              <p className="blk__s">{t.home.benefitLead}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================== ШАГИ — слайд 6 (контейнер: мятная, тёмно-зелёная, фото) ================== */}
      <section className="band band--tight">
        <div className="wrap">
          <Reveal>
            <div className="sechead sechead--top sechead--ruled">
              <div className="h-aside">
                <p className="h-aside__p">{t.home.calcLead}</p>
              </div>
              <h2 className="h-big h-big--right">{t.home.stepsHead}</h2>
            </div>
            <Rule className="rule--head" />
          </Reveal>
          <Reveal delay={60}>
            <div className="groupbox">
              {t.home.steps.slice(0, 2).map((s, i) => (
                <div className={`blk blk--tall ${i === 0 ? 'blk--accent' : 'blk--forest'}`} key={s.t}>
                  <p className="blk__n">0{i + 1}</p>
                  <div>
                    <h3 className="blk__t">{s.t}</h3>
                    <p className="blk__s">{s.d}</p>
                  </div>
                </div>
              ))}
              <div className="panel panel--mono">
                <Picture name="about" alt={t.alt.workshop} ratio="4x3" widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 32vw" />
                <span className="badge badge--accent badge--bl">
                  <span className="badge__text">03 · {t.home.steps[2].t}</span>
                  <span className="badge__dot"><Icon name="check" size={18} /></span>
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================================ КАЛЬКУЛЯТОР ================================ */}
      <section className="band band--tight calcband">
        <div className="wrap">
          <Reveal>
            <div className="sechead sechead--ruled">
              <h2 className="h-big">{t.home.calcHead}</h2>
              <div className="h-aside">
                <p className="h-aside__p">{t.home.calcLead}</p>
              </div>
            </div>
            <Rule className="rule--head" />
          </Reveal>
          <Calculator />
        </div>
      </section>

      {/* ================== ОГЛАВЛЕНИЕ УСЛУГ — слайд 2 (мелкие карточки, заголовок внизу) ================== */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="tocgrid">
            {groupRows.map(({ g, from, n }, i) => {
              const svc = GROUP_SERVICE[g.key]
              const tone = i === 2 ? ' blk--accent' : i === 3 ? ' blk--forest' : ''
              const body = (
                <>
                  <p className="blk__n--small">{t.prices.from} {from} {cur} · {n} {t.prices.positions}</p>
                  <p className="blk__t">{g.name[locale] ?? g.key}</p>
                  <span className="blk__gap" />
                  <p className="blk__s">{svc ? svc.tr[locale].blurb : ''}</p>
                </>
              )
              // Ряды по три, чётные сдвинуты на колонку вправо — как на слайде
              const row = Math.floor(i / 3)
              const col = (i % 3) + (row % 2 ? 2 : 1)
              return (
                <Reveal key={g.key} delay={Math.min(i, 8) * 40} col={col}>
                  {svc
                    ? <Link className={`blk blk--xs toc__card${tone}`} to={svc.paths[locale]}>{body}</Link>
                    : <div className={`blk blk--xs toc__card${tone}`}>{body}</div>}
                </Reveal>
              )
            })}
            <span className="btn-round toc__mark" aria-hidden="true"><SparkDot tone="light" size={40} /></span>
          </div>

          <Reveal>
            <div className="sechead sechead--ruled toc__head">
              <h2 className="h-big">
                {t.home.benefitHead} {t.home.benefitHeadTail}
              </h2>
              <div className="h-aside">
                <p className="h-aside__t">{t.home.pricesHead}</p>
                <p className="h-aside__p">{t.home.pricesLead}</p>
              </div>
            </div>
            <Rule className="rule--head" />
          </Reveal>
        </div>
      </section>

      {/* ============ УСЛУГИ — слайд 8 (фото в тёмной обойме, мятные подписи) ============ */}
      <section className="band band--tight">
        <div className="wrap">
          <Reveal>
            <div className="sechead sechead--top sechead--ruled">
              <h2 className="h-big">
                {t.home.servicesHead}{' '}
                {/* Фото-чип внутри заголовка — оформление, не контент */}
                <Picture name="drains" alt="" ratio="3x2" widths={[800]} sizes="132px" className="inline-chip" />{' '}
                {t.home.servicesLead}
              </h2>
              <div className="h-aside">
                <p className="h-aside__t">{t.cta.allServices}</p>
                <p className="h-aside__p">{t.home.benefitLead}</p>
              </div>
            </div>
            <Rule className="rule--head" />
          </Reveal>

          <Reveal delay={60}>
            <div className="team">
              <Link className="ring-btn team__go" to={pathOf(KEY_PAGES.services, locale)} aria-label={t.cta.allServices}>
                <Icon name="arrow" size={26} />
              </Link>
              {featured.map((s) => {
                const from = priceOf(s)
                return (
                  <Link className="panel panel--mono team__card" key={s.key} to={s.paths[locale]}>
                    <Picture name={s.image!} alt={serviceAlt(s.tr[locale].h1)} ratio="3x2" widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 30vw" />
                    <span className="badge badge--accent badge--bl team__badge">
                      <span className="badge__dot"><SparkDot tone="accent" /></span>
                      <span className="badge__text">
                        <b>{s.tr[locale].h1.split(' — ')[0]}</b>
                        <small>{from !== null ? `${t.prices.from} ${from} ${cur}` : s.tr[locale].blurb}</small>
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </Reveal>

          {/* остальные услуги — слайд 11: нумерованные высокие карточки и тёмное фото */}
          <div className="blocks blocks--3 svc-more">
            {more.map((s, i) => {
              const tone = i === 0 ? ' blk--forest' : i === 1 ? ' blk--accent' : ''
              if (i === 2) {
                return (
                  <Reveal key={s.key} delay={80}>
                    <Link className="panel panel--card panel--mono svc-more__photo" to={s.paths[locale]}>
                      <Picture name={s.image!} alt={serviceAlt(s.tr[locale].h1)} ratio="3x2" widths={[800, 1200, 1600]} sizes="(max-width: 900px) 100vw, 30vw" />
                      <span className="badge badge--bl">
                        <span className="badge__text">{s.tr[locale].h1.split(' — ')[0]}</span>
                        <span className="badge__dot"><Icon name="arrowUpRight" size={18} /></span>
                      </span>
                    </Link>
                  </Reveal>
                )
              }
              return (
                <Reveal key={s.key} delay={(i % 3) * 60}>
                  <Link className={`blk blk--tall${tone}`} to={s.paths[locale]}>
                    <p className="blk__n">{String(i + 1).padStart(2, '0')}</p>
                    <div>
                      <h3 className="blk__t">{s.tr[locale].h1}</h3>
                      <p className="blk__s">{s.tr[locale].blurb}</p>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ ЧТО ОБЫЧНО БЕСПОКОИТ — слайд 3 (цитата + фото с наклейкой) ============ */}
      <section className="band band--tight">
        <div className="wrap">
          <div className="blocks blocks--wide-left blocks--top">
            <Reveal>
              <div className="sechead sechead--stack">
                <h2 className="h-big h-big--wide">{f.heading}</h2>
              </div>
              <Accordion items={f.items} />
            </Reveal>
            <Reveal delay={90}>
              <div className="panel panel--card panel--mono panel--fill about-panel">
                <Picture name="hero-alt" alt={t.alt.interior} ratio="4x3" widths={[900, 1400, 2000]} sizes="(max-width: 900px) 100vw, 34vw" />
                <span className="sticker about-panel__sticker">{CONTACT.city}<br />{CONTACT.radiusKm} km</span>
                <Link className="badge badge--bl" to={pathOf(KEY_PAGES.about, locale)}>
                  <span className="badge__text">{t.nav.about}</span>
                  <span className="badge__dot"><Icon name="arrowUpRight" size={18} /></span>
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
