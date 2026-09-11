import { useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Avatar from './Avatar'

/** Загрузка фотографии. Свою ставит сам сотрудник, чужую — администратор;
 *  права проверяет Storage, а не эта форма. */
export default function AvatarPicker({ staffId, name, path, onDone }: {
  staffId: string; name: string; path?: string | null; onDone: (p: string) => void
}) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setErr('')
    try {
      // Путь начинается с id сотрудника: по нему Storage и различает,
      // свой это файл или чужой
      const key = `${staffId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await sb.storage.from('avatars').upload(key, file, { upsert: true })
      if (up.error) throw up.error
      const { error } = await sb.rpc('set_staff_avatar', { p_staff: staffId, p_path: key })
      if (error) throw error
      onDone(key)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="split">
      <Avatar name={name} path={path} size="xl" />
      <div>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                onClick={() => input.current?.click()}>
          {busy ? <span className="spin" /> : t('prof.photo')}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
        {err && <p className="err tiny">{err}</p>}
      </div>
    </div>
  )
}
