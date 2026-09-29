import { usePage } from './PageContext'
import E, { U } from '../cms/E'
import { factVars } from '../lib/facts'
import { fill } from '../lib/ui-extra'

/** «HAWK.FIX коротко»: кто, где, сколько, когда, как заказать.
 *  Короткие фактические строки — их цитируют и поиск, и ассистенты;
 *  класс `.facts` указан в `speakable` разметки страницы. */
export default function Facts() {
  const { t } = usePage()
  const vars = factVars()
  return (
    <section className="s-band facts" aria-labelledby="facts-h">
      <div className="wrap s-split">
        <div>
          <U as="h2" id="facts-h" className="s-h2" k="facts.head" />
          <U as="p" className="s-lead facts__lead" k="facts.lead" multiline />
        </div>
        <dl className="facts__list">
          {t.facts.rows.map((r, i) => (
            <div className="facts__row" key={r.k}>
              <U as="dt" className="facts__k" k={`facts.rows.${i}.k`} />
              <E as="dd" className="facts__v" k={`ui:facts.rows.${i}.v`} v={fill(r.v, vars)} multiline />
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
