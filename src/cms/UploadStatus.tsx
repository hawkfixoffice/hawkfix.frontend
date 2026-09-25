import type { UploadStage } from './store'

export const fmtBytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** Плашка у каждой загрузки фото: конвертация → отправка → готово (с весом). */
export default function UploadStatus({ st }: { st: UploadStage }) {
  const cls = `upst upst--${st.stage}`
  if (st.stage === 'convert') return <span className={cls}><i className="upst__spin" />Konwersja do WebP… <small>{fmtBytes(st.from)}</small></span>
  if (st.stage === 'upload') return <span className={cls}><i className="upst__spin" />Wysyłanie… <small>WebP {fmtBytes(st.to)}</small></span>
  if (st.stage === 'error') return <span className={cls}>✕ Nie udało się: {st.error}</span>
  return (
    <span className={cls}>
      ✓ Zapisano jako WebP{' '}
      <small>{fmtBytes(st.from)} → {fmtBytes(st.to)}{st.from > st.to ? ` (−${Math.round((1 - st.to / st.from) * 100)}%)` : ''}</small>
    </span>
  )
}
