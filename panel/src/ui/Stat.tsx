import type { ReactNode } from 'react'
import { Spark, type Point } from './Chart'

/** Карточка показателя: крупное число, сравнение с прошлым периодом
 *  и мини-график, который при наведении показывает конкретный день. */
export default function Stat({ label, value, trend, foot, art, format }: {
  label: string
  value: ReactNode
  trend?: number | null
  foot?: ReactNode
  art?: Point[]
  format?: (v: number) => string
}) {
  const dir = trend == null ? null : trend >= 0 ? 'up' : 'down'
  return (
    <div className="card stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value num">{value}</div>
      {art && art.length > 1 && <Spark data={art} format={format} />}
      <div className="stat__foot">
        {dir && (
          <span className="trend" data-dir={dir}>
            {dir === 'up' ? '▲' : '▼'} {Math.abs(Math.round(trend!))}%
          </span>
        )}
        {foot}
      </div>
    </div>
  )
}
