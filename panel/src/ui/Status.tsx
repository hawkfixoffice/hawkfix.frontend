import { useT } from '../lib/i18n'

/** Цвет статуса заказа — один и тот же во всех списках,
 *  чтобы состояние читалось не по надписи, а по цвету. */
const TONE: Record<string, string> = {
  new: 'badge--ghost', offered: 'badge--warn', assigned: 'badge--mint',
  en_route: 'badge--mint', shopping: 'badge--warn', in_progress: 'badge--forest',
  done: 'badge--dark', cancelled: 'badge--bad',
}

export default function Status({ value, overdue }: { value: string; overdue?: boolean }) {
  const { t } = useT()
  if (overdue && value !== 'done' && value !== 'cancelled') {
    return <span className="badge badge--bad"><i className="dot" />{t('ord.overdue')}</span>
  }
  return <span className={`badge ${TONE[value] ?? ''}`}>{t(`ord.status.${value}`)}</span>
}
