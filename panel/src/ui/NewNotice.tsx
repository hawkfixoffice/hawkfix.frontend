import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'

/** Полоса «есть новые заказы».
 *
 *  Заявка с сайта становится заказом со статусом «новый», а список заказов
 *  по умолчанию показывает вкладку «в работе» — свежая заявка молча лежала
 *  в стороне, и казалось, что она не дошла. Ночью к этому добавляется
 *  правило тишины: с 23:00 до 05:00 заказы мастерам не рассылаются, и об
 *  этом тоже лучше сказать прямо, чем оставлять человека в догадках. */
export default function NewNotice({ onOpen }: { onOpen?: () => void }) {
  const { t } = useT()
  const nav = useNavigate()
  const [n, setN] = useState(0)
  const [quiet, setQuiet] = useState<{ on: boolean; from: string; to: string } | null>(null)

  useEffect(() => {
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setN(count ?? 0))

    Promise.all([
      sb.rpc('is_quiet_now'),
      sb.from('panel_settings').select('key, value').in('key', ['quiet_from', 'quiet_to']),
    ]).then(([q, s]) => {
      const map = Object.fromEntries((s.data ?? []).map((r: any) => [r.key, String(r.value).replace(/"/g, '')]))
      setQuiet({ on: Boolean(q.data), from: map.quiet_from ?? '23:00', to: map.quiet_to ?? '05:00' })
    })
  }, [])

  if (n === 0) return null

  return (
    <div className="notice" data-kind={quiet?.on ? 'quiet' : 'fresh'}>
      <b>{quiet?.on ? t('ord.quietTitle') : t('ord.freshTitle')}</b>
      <span>
        {quiet?.on
          ? t('ord.quietText', { from: quiet.from, to: quiet.to, n })
          : t('ord.freshText', { n })}
      </span>
      <button className="btn btn--ghost btn--sm"
              onClick={() => (onOpen ? onOpen() : nav('/orders'))}>
        {t('ord.new')} · {n}
      </button>
    </div>
  )
}
