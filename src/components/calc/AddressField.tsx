import { useEffect, useId, useRef, useState } from 'react'
import { searchAddress, outOfZone, type AddressHit } from '../../lib/address'
import { usePage } from '../PageContext'
import Icon from '../Icon'

/** Поле адреса с подсказками из OSM. Адрес считается подтверждённым только
 *  тогда, когда человек выбрал вариант из списка: свободный текст сверить
 *  не с чем, а «улица, которой нет» просто не появится в подсказках. */
export default function AddressField({
  value, hit, onChange, onPick,
}: {
  value: string
  hit: AddressHit | null
  onChange: (v: string) => void
  onPick: (h: AddressHit | null) => void
}) {
  const { locale } = usePage()
  const T = TEXT[locale] ?? TEXT.pl
  const id = useId()
  const [list, setList] = useState<AddressHit[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const box = useRef<HTMLDivElement>(null)
  // Пока человек не трогал поле после выбора, повторный запрос не нужен
  const picked = useRef(false)

  useEffect(() => {
    if (picked.current) { picked.current = false; return }
    const q = value.trim()
    if (q.length < 3) { setList([]); setBusy(false); setFailed(false); return }

    const ctl = new AbortController()
    setBusy(true)
    const id = setTimeout(() => {
      searchAddress(q, ctl.signal)
        .then((hits) => { setList(hits); setFailed(false); setOpen(true) })
        .catch((e) => { if ((e as Error).name !== 'AbortError') { setList([]); setFailed(true) } })
        .finally(() => setBusy(false))
    }, 320)

    return () => { clearTimeout(id); ctl.abort() }
  }, [value])

  // Клик мимо закрывает список, но введённый текст оставляет
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function pick(h: AddressHit) {
    picked.current = true
    onChange(h.label)
    onPick(h)
    setOpen(false)
    setCursor(-1)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !list.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % list.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + list.length) % list.length) }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); pick(list[cursor]) }
    else if (e.key === 'Escape') { setOpen(false); setCursor(-1) }
  }

  const notFound = !busy && !failed && value.trim().length >= 3 && !hit && list.length === 0

  return (
    <div className="field field--wide addr" ref={box}>
      <label htmlFor={`${id}-a`}>{T.label}</label>
      <div className="addr__box">
        <input
          id={`${id}-a`} name="address" value={value} autoComplete="street-address"
          placeholder={T.placeholder} role="combobox" aria-expanded={open}
          aria-controls={`${id}-list`} aria-autocomplete="list"
          onChange={(e) => { onChange(e.target.value); onPick(null) }}
          onFocus={() => list.length && setOpen(true)}
          onKeyDown={onKey}
        />
        <span className="addr__state" aria-hidden="true">
          {busy ? <span className="addr__spin" /> : hit ? <Icon name="check" size={17} /> : null}
        </span>

        {open && list.length > 0 && (
          <ul className="addr__list" id={`${id}-list`} role="listbox">
            {list.map((h, i) => (
              <li key={h.label} role="option" aria-selected={i === cursor}>
                <button
                  type="button" data-on={i === cursor || undefined}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(h)}
                >
                  <span className="addr__street">{[h.street, h.house].filter(Boolean).join(' ')}</span>
                  <span className="addr__meta">
                    {[h.postcode, h.city, h.district].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hit && outOfZone(hit) && (
        <p className="field__hint field__hint--warn">{T.far.replace('{km}', String(Math.round(hit.km)))}</p>
      )}
      {hit && !hit.exact && <p className="field__hint">{T.noHouse}</p>}
      {notFound && <p className="field__hint field__hint--warn">{T.notFound}</p>}
      {failed && <p className="field__hint">{T.offline}</p>}
    </div>
  )
}

const TEXT: Record<string, Record<string, string>> = {
  pl: {
    label: 'Adres', placeholder: 'Ulica i numer, np. Marszałkowska 10',
    notFound: 'Nie znaleźliśmy takiego adresu. Sprawdź pisownię albo wpisz sam numer domu.',
    noHouse: 'Dopisz numer domu — ekipa trafi od razu.',
    far: 'To ok. {km} km od centrum — dojazd poza strefą wyceniamy osobno.',
    offline: 'Podpowiedzi chwilowo niedostępne — adres możesz wpisać ręcznie.',
  },
  uk: {
    label: 'Адреса', placeholder: 'Вулиця і номер, напр. Marszałkowska 10',
    notFound: 'Такої адреси не знайшли. Перевірте написання або додайте номер будинку.',
    noHouse: 'Додайте номер будинку — бригада приїде одразу за адресою.',
    far: 'Це бл. {km} км від центру — виїзд за межі зони рахуємо окремо.',
    offline: 'Підказки тимчасово недоступні — адресу можна вписати вручну.',
  },
  ru: {
    label: 'Адрес', placeholder: 'Улица и номер, напр. Marszałkowska 10',
    notFound: 'Такой адрес не найден. Проверьте написание или добавьте номер дома.',
    noHouse: 'Добавьте номер дома — бригада приедет сразу по адресу.',
    far: 'Это ок. {km} км от центра — выезд за пределы зоны считаем отдельно.',
    offline: 'Подсказки временно недоступны — адрес можно вписать вручную.',
  },
  en: {
    label: 'Address', placeholder: 'Street and number, e.g. Marszałkowska 10',
    notFound: 'We couldn’t find that address. Check the spelling or add the house number.',
    noHouse: 'Add the house number so the crew arrives at the right door.',
    far: 'That’s about {km} km from the centre — travel outside the zone is quoted separately.',
    offline: 'Suggestions are unavailable right now — you can type the address by hand.',
  },
}
