import { useId, useState } from 'react'
import Icon from './Icon'
import Collapse from './Collapse'

/** Аккордеон вопросов: открыт один пункт, знак «+» поворачивается в «×». */
export default function Accordion({ items, className = '' }: { items: { q: string; a: string }[]; className?: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const base = useId()
  return (
    <div className={`acc ${className}`}>
      {items.map((x, i) => {
        const open = openIdx === i
        const id = `${base}-${i}`
        return (
          <div className="acc__item" key={x.q} data-open={open}>
            <button
              type="button" className="acc__head" aria-expanded={open} aria-controls={id}
              onClick={() => setOpenIdx(open ? null : i)}
            >
              <span>{x.q}</span>
              <span className="acc__sign"><Icon name="plus" size={18} /></span>
            </button>
            <Collapse open={open} id={id}>
              <p className="acc__body">{x.a}</p>
            </Collapse>
          </div>
        )
      })}
    </div>
  )
}
