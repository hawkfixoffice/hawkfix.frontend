import type { Locale, PriceItem, Settings } from '../../lib/types'
import Icon from '../Icon'

interface Props {
  item: PriceItem
  qty: number
  locale: Locale
  settings: Settings
  onAdd: () => void
  onSet: (q: number) => void
  labels: { add: string; minus: string; plus: string; remove: string }
}

/** Строка позиции: пока не выбрана — одна кнопка «добавить»,
 *  после выбора превращается в счётчик. Зоны нажатия ≥44px. */
export default function ItemRow({ item, qty, locale, settings, onAdd, onSet, labels }: Props) {
  const unit = settings.units[locale]?.[item.unit] ?? item.unit
  const name = item.name[locale]
  const selected = qty > 0

  return (
    <li className="irow" data-selected={selected}>
      <div className="irow__main">
        <span className="irow__name">{name}</span>
        <span className="irow__price num">
          {item.price} {settings.currency}
          <span className="irow__unit"> / {unit}</span>
        </span>
      </div>

      {selected ? (
        <div className="stepper" role="group" aria-label={name}>
          <button type="button" aria-label={labels.minus} onClick={() => onSet(qty - 1)}>
            <Icon name={qty === 1 ? 'x' : 'minus'} size={16} />
          </button>
          <input
            className="num" type="number" inputMode="numeric"
            min={item.min} max={item.max} value={qty}
            aria-label={`${name}, ${unit}`}
            onChange={(e) => onSet(Number(e.target.value))}
          />
          <button type="button" aria-label={labels.plus} onClick={() => onSet(qty + 1)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      ) : (
        <button className="irow__add" type="button" onClick={onAdd} aria-label={`${labels.add}: ${name}`}>
          <Icon name="plus" size={17} />
        </button>
      )}
    </li>
  )
}
