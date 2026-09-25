import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TARGETS, TARGET_NAME, type Progress } from '../lib/translate'
import './publish.css'

/**
 * Окно публикации: список изменений → «Przetłumacz i opublikuj» →
 * прогресс перевода по трём языкам → публикация → (для сайта) пересборка.
 * Общее для сайта и панели. Всё, что делается, передаётся функцией `run`:
 * она сообщает прогресс, а окно только показывает его.
 */
export default function PublishDialog({ title, changes, run, onClose, rebuild = false }: {
  title: string
  changes: { label: string; kind?: string }[]
  run: (report: (p: Partial<Progress>) => void) => Promise<void>
  onClose: (published: boolean) => void
  /** Показать шаг «пересборка страницы для Google» (только сайт). */
  rebuild?: boolean
}) {
  const [p, setP] = useState<Progress | null>(null)
  const total = changes.filter((c) => c.kind !== 'image' && c.kind !== 'reset').length

  async function go() {
    const state: Progress = { stage: 'translate', done: { uk: 0, ru: 0, en: 0 }, total }
    setP({ ...state })
    const report = (x: Partial<Progress>) => { Object.assign(state, x); setP({ ...state, done: { ...state.done } }) }
    try {
      await run(report)
      report({ stage: 'done' })
    } catch (e) {
      report({ stage: 'error', error: (e as Error).message })
    }
  }

  const busy = p && !['done', 'error'].includes(p.stage)
  const pct = (n: number) => (p?.total ? Math.round((n / p.total) * 100) : 100)

  return createPortal(
    <div className="pubd" role="dialog" aria-modal="true" aria-label={title}
         onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(p?.stage === 'done') }}>
      <div className="pubd__box">
        <div className="pubd__head">
          <h2>{title}</h2>
          {!busy && <button type="button" className="pubd__x" onClick={() => onClose(p?.stage === 'done')} aria-label="Zamknij">✕</button>}
        </div>

        {!p && (
          <>
            <p className="pubd__lead">
              Zmiany po polsku: <b>{changes.length}</b>. Teksty przetłumaczymy na ukraiński, rosyjski i angielski,
              a dopiero potem opublikujemy wszystko razem. Do tego czasu klienci widzą poprzednią wersję.
            </p>
            <ul className="pubd__list">
              {changes.slice(0, 40).map((c, i) => (
                <li key={i}><span className="pubd__kind" data-k={c.kind ?? 'text'}>{KIND[c.kind ?? 'text'] ?? 'tekst'}</span>{c.label}</li>
              ))}
              {changes.length > 40 && <li className="pubd__more">…i jeszcze {changes.length - 40}</li>}
            </ul>
            <div className="pubd__actions">
              <button type="button" className="pubd__go" onClick={go} disabled={!changes.length}>Przetłumacz i opublikuj</button>
              <button type="button" className="pubd__ghost" onClick={() => onClose(false)}>Anuluj</button>
            </div>
          </>
        )}

        {p && (
          <>
            <div className="pubd__langs">
              {TARGETS.map((l) => (
                <div className="pubd__lang" key={l} data-done={p.done[l] >= p.total || undefined}>
                  <span className="pubd__name">{TARGET_NAME[l]}</span>
                  <span className="pubd__bar"><i style={{ width: `${pct(p.done[l])}%` }} /></span>
                  <span className="pubd__num">{p.total ? `${p.done[l]} / ${p.total}` : '—'}</span>
                </div>
              ))}
            </div>
            <ol className="pubd__steps">
              <li data-s={stepState(p, 'translate')}>Tłumaczenie (Barabash AI)</li>
              <li data-s={stepState(p, 'publish')}>Publikacja wszystkich języków naraz</li>
              {rebuild && <li data-s={stepState(p, 'rebuild')}>Przebudowa strony dla Google</li>}
            </ol>
            {p.stage === 'done' && <p className="pubd__ok">✓ Opublikowane. Klienci widzą nową wersję we wszystkich językach.</p>}
            {p.stage === 'error' && (
              <>
                <p className="pubd__err">{p.error}</p>
                <p className="pubd__hint">Nic nie zostało opublikowane — zmiany czekają w wersji roboczej.</p>
              </>
            )}
            {!busy && (
              <div className="pubd__actions">
                {p.stage === 'error' && <button type="button" className="pubd__go" onClick={go}>Spróbuj ponownie</button>}
                <button type="button" className="pubd__ghost" onClick={() => onClose(p.stage === 'done')}>Zamknij</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

const KIND: Record<string, string> = { text: 'tekst', html: 'tekst', image: 'zdjęcie', reset: 'przywróć', item: 'pozycja', group: 'kategoria', subgroup: 'podkategoria' }
const ORDER = ['translate', 'publish', 'rebuild', 'done']
function stepState(p: Progress, step: string): string {
  if (p.stage === 'error') return ORDER.indexOf(step) < ORDER.indexOf('publish') && p.done.uk >= p.total ? 'ok' : 'wait'
  const cur = ORDER.indexOf(p.stage), me = ORDER.indexOf(step)
  return me < cur ? 'ok' : me === cur ? 'run' : 'wait'
}
