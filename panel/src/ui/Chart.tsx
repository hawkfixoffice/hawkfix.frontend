import { useRef, useState } from 'react'

export interface Point { label: string; value: number; extra?: string }

/** Графики рисуем сами: своя отрисовка — это два десятка строк против
 *  60 КБ библиотеки, и цвета берутся из тех же токенов, что вся панель.
 *
 *  Подсказка при наведении — своя, а не браузерный `title`: тот появляется
 *  с задержкой, ложится поверх заголовка карточки и не показывает,
 *  к какому именно дню относится значение. */
function useHover(count: number) {
  const box = useRef<HTMLDivElement>(null)
  const [i, setI] = useState<number | null>(null)
  const [x, setX] = useState(0)

  const onMove = (e: React.MouseEvent) => {
    const el = box.current
    if (!el || count === 0) return
    const r = el.getBoundingClientRect()
    const rel = Math.min(Math.max(e.clientX - r.left, 0), r.width)
    setI(Math.min(count - 1, Math.round((rel / r.width) * (count - 1))))
    setX(rel)
  }
  return { box, i, x, onMove, onLeave: () => setI(null) }
}

function Tip({ x, width, title, lines }: { x: number; width: number; title: string; lines: string[] }) {
  // Возле краёв подсказка разворачивается внутрь, иначе её обрежет карточка
  const side = x > width - 110 ? 'end' : x < 110 ? 'start' : 'center'
  return (
    <div className="tip" data-side={side} style={{ left: x }}>
      <b>{title}</b>
      {lines.map((l, n) => <span key={n}>{l}</span>)}
    </div>
  )
}

/** Линия с заливкой: выручка по дням, заработок мастера и т. п. */
export function AreaChart({ data, height = 220, format, secondary }: {
  data: Point[]
  height?: number
  format?: (v: number) => string
  /** Вторая величина того же дня — например прибыль рядом с выручкой */
  secondary?: { label: string; values: number[]; format?: (v: number) => string }
}) {
  const h = useHover(data.length)
  if (!data.length) return <p className="empty">—</p>

  const W = 100, H = 100
  const max = Math.max(...data.map((d) => d.value), ...(secondary?.values ?? [0]), 1)
  const at = (i: number, v: number): [number, number] => [
    (i / Math.max(1, data.length - 1)) * W,
    H - (v / max) * (H - 10),
  ]
  const path = (vals: number[]) =>
    vals.map((v, i) => at(i, v).map((n) => n.toFixed(2)).join(',')).join(' L')

  const line = path(data.map((d) => d.value))
  const area = `M0,${H} L${line} L${W},${H} Z`
  const cur = h.i != null ? data[h.i] : null

  // Точку под курсором рисуем не в SVG: холст растянут по ширине
  // (`preserveAspectRatio="none"`), и круг в нём превращается в лепёшку.
  // Обычный div поверх графика всегда остаётся круглым.
  const knob = h.i != null
    ? { left: `${(at(h.i, 0)[0] / W) * 100}%`, top: `${(at(h.i, data[h.i].value)[1] / H) * 100}%` }
    : null

  return (
    <div className="chartbox" ref={h.box} onMouseMove={h.onMove} onMouseLeave={h.onLeave} style={{ height }}>
      <div className="chart__plot">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        {[0, 25, 50, 75].map((y) => (
          <line key={y} className="grid-line" x1="0" x2={W} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
        ))}
        <path className="area" d={area} />
        <path className="line" d={`M${line}`} vectorEffect="non-scaling-stroke" />
        {secondary && (
          <path className="line line--alt" d={`M${path(secondary.values)}`} vectorEffect="non-scaling-stroke" />
        )}
        {h.i != null && (
          <line className="cursor" x1={at(h.i, 0)[0]} x2={at(h.i, 0)[0]} y1="0" y2={H} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {knob && <span className="knob" style={knob} />}
      </div>

      {cur && (
        <Tip x={h.x} width={h.box.current?.clientWidth ?? 0} title={cur.label}
             lines={[
               format ? format(cur.value) : String(cur.value),
               ...(secondary ? [`${secondary.label}: ${(secondary.format ?? format ?? String)(secondary.values[h.i!] ?? 0)}`] : []),
               ...(cur.extra ? [cur.extra] : []),
             ]} />
      )}

      <div className="chart__axis">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** Столбики: по месяцам, по мастерам. */
export function BarChart({ data, height = 220, format }: {
  data: Point[]; height?: number; format?: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (!data.length) return <p className="empty">—</p>
  const max = Math.max(...data.map((d) => d.value), 1)
  const top = data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0)
  const step = data.length > 16 ? Math.ceil(data.length / 8) : 1

  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div className="bars__col" key={d.label + i}
             onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <div className="tip tip--bar">
              <b>{d.label}</b>
              <span>{format ? format(d.value) : d.value}</span>
              {d.extra && <span>{d.extra}</span>}
            </div>
          )}
          <div className="bars__bar" data-top={i === top || undefined} data-on={hover === i || undefined}
               style={{ height: `${Math.max(3, (d.value / max) * (height - 38))}px` }} />
          {/* На месяце подписей больше, чем помещается: оставляем каждую N-ю,
              остальные читаются в подсказке при наведении */}
          <span className="tiny muted">{i % step === 0 || i === data.length - 1 ? d.label : ''}</span>
        </div>
      ))}
    </div>
  )
}

/** Маленький график внутри карточки-показателя: та же подсказка, что у больших. */
export function Spark({ data, format }: { data: Point[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return null
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="spark">
      {data.map((d, i) => (
        <span key={i} className="spark__col"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <span className="tip tip--spark">
              <b>{d.label}</b>
              <span>{format ? format(d.value) : d.value}</span>
            </span>
          )}
          <i style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }} data-on={hover === i || undefined} />
        </span>
      ))}
    </div>
  )
}
