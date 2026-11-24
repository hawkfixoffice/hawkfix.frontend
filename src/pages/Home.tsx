import { Link } from 'react-router-dom'
import { KEY_PAGES, pathOf } from '../data/content'
import { faq } from '../data/faq'
import { usePage } from '../components/PageContext'
import Picture from '../components/Picture'
import Icon from '../components/Icon'
import Accordion from '../components/Accordion'
import Calculator from '../components/calc/Calculator'
import Facts from '../components/Facts'
import { CtaBand, ServiceRows } from '../components/Simple'
import WaComposer from '../components/wa/WaComposer'
import E, { U } from '../cms/E'

/** Главная в простой вёрстке (2026-09-29): крупный текст, много воздуха,
 *  ни одного декоративного элемента. Калькулятор — без изменений. */
export default function Home() {
  const { locale, t } = usePage()
  const f = faq[locale]

  return (
    <>
      {/* ================================ ГЕРОЙ ================================ */}
      <section className="s-hero">
        <div className="wrap s-hero__grid">
          <div className="s-hero__text">
            <U as="p" className="s-kicker" k="hero.kicker" />
            <U as="h1" className="s-hero__h1" k="hero.tagline" />
            <U as="p" className="s-lead" k="hero.sub" multiline />
            {/* Первый шаг к заказу — прямо с первого экрана: «что случилось?»
                с подсказками из прайса → WhatsApp с кодом заявки и черновик
                в панели. Цены — только у выбранных работ, ниже поля. */}
            <WaComposer variant="hero" />
          </div>
          <div className="s-hero__photo">
            <Picture
              name="hero-alt" alt={t.alt.interior} ratio="4x3"
              widths={[900, 1400, 2000]} sizes="(max-width: 900px) 100vw, 44vw" priority
            />
          </div>
        </div>
      </section>

      {/* ================================ 3 ШАГА ================================ */}
      {/* Коротко (2026-11-24): номер, заголовок и одна строка — без больших кругов */}
      <section className="s-band s-band--tight">
        <div className="wrap">
          <U as="h2" className="s-h2 s-flow__h" k="home.stepsHead" />
          <ol className="s-flow">
            {t.flow.map((s, i) => (
              <li key={s.t}>
                <span className="s-flow__n num">{i + 1}</span>
                <span className="s-flow__body">
                  <U as="b" className="s-flow__t" k={`flow.${i}.t`} />
                  <U as="span" className="s-flow__d" k={`flow.${i}.d`} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============================ КАЛЬКУЛЯТОР ============================ */}
      <section className="s-band calcband" id="wycena">
        <div className="wrap">
          <U as="h2" className="s-h2" k="home.calcHead" />
          <U as="p" className="s-lead" k="home.calcLead" multiline />
          <div className="s-calc"><Calculator /></div>
        </div>
      </section>

      {/* =============================== УСЛУГИ =============================== */}
      <section className="s-band">
        <div className="wrap">
          <div className="s-headrow">
            <U as="h2" className="s-h2" k="simple.servicesHead" />
            <Link className="s-more" to={pathOf(KEY_PAGES.prices, locale)}>
              <U k="simple.pricesLink" /> <Icon name="arrow" size={18} />
            </Link>
          </div>
          <U as="p" className="s-lead" k="home.benefitLead" multiline />
          <ServiceRows />
        </div>
      </section>

      <Facts />

      {/* =============================== ВОПРОСЫ =============================== */}
      <section className="s-band">
        <div className="wrap s-narrow">
          <E as="h2" className="s-h2" k="faq:heading" v={f.heading} />
          <Accordion items={f.items} cmsKey="faq" className="s-acc" />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
