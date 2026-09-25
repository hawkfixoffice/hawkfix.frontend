import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cms, useCms } from './store'
import { PANEL_AUTH_KEY, SUPA_KEY, SUPA_URL } from '../lib/supa'
import { rid, toWebp } from '../lib/webp'
import Toolbar from './Toolbar'

/**
 * Модуль администратора на сайте. Грузится отдельным чанком и только тогда,
 * когда в браузере есть сессия панели (см. CmsBoot): посетитель не качает
 * ни supabase-js, ни редактор.
 *
 * Права проверяет база: писать в `site_content` и в бакет `site-media`
 * может только тот, у кого `is_admin()`. Здесь роль читаем лишь затем,
 * чтобы не показывать панель менеджеру и мастеру.
 */
let sb: SupabaseClient | null = null
const client = () => (sb ??= createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: PANEL_AUTH_KEY },
}))

const LS_EDIT = 'hawkfix.cms.editing'

export default function Admin() {
  const { admin, editing } = useCms()
  const [who, setWho] = useState('')
  const [saving, setSaving] = useState(0)
  const [note, setNote] = useState('')
  const [publishing, setPublishing] = useState(false)

  // Кто вошёл: роль только из таблицы staff
  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = client()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const { data } = await s.from('staff').select('role, full_name').eq('id', session.user.id).maybeSingle()
      if (!alive || data?.role !== 'admin') return
      setWho(data.full_name)
      installActions(s, setSaving, setNote)
      let on = false
      try { on = sessionStorage.getItem(LS_EDIT) === '1' || new URLSearchParams(location.search).has('edit') } catch { /* */ }
      cms.set({ admin: true, editing: on })
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(LS_EDIT, editing ? '1' : '0') } catch { /* */ }
    document.documentElement.toggleAttribute('data-cms-editing', editing)
  }, [editing])

  if (!admin) return null

  async function publish() {
    setPublishing(true); setNote('')
    const { data, error } = await client().functions.invoke('site-publish', { body: {} })
    setPublishing(false)
    if (error || data?.error) {
      setNote(data?.error === 'no_github_token'
        ? 'Zmiany już są na stronie. Przebudowa wersji dla Google wymaga tokenu GitHub w sekretach Supabase.'
        : `Nie udało się: ${data?.error ?? error?.message}`)
    } else setNote('Przebudowa ruszyła — wersja dla wyszukiwarek odświeży się za 2–3 minuty.')
  }

  return createPortal(
    <>
      {editing && <Toolbar />}
      <div className="cmsbar" role="region" aria-label="Edytor strony">
        <span className="cmsbar__who">HAWK.FIX · {who}</span>
        <button type="button" className={`cmsbar__btn${editing ? ' on' : ''}`} onClick={() => cms.set({ editing: !editing })}>
          {editing ? '✓ Edycja włączona' : '✎ Edytuj stronę'}
        </button>
        {editing && (
          <button type="button" className="cmsbar__btn" onClick={publish} disabled={publishing}>
            {publishing ? 'Publikuję…' : '⇪ Opublikuj dla Google'}
          </button>
        )}
        <a className="cmsbar__btn" href="/panel/#/prices">Cennik w panelu</a>
        {saving > 0 && <span className="cmsbar__who">Zapisuję…</span>}
        {editing && (
          <span className="cmsbar__hint">
            Kliknij tekst, żeby go zmienić. Zaznacz fragment — pojawi się pasek stylów. Kliknij zdjęcie,
            żeby je podmienić (zapisze się jako WebP, zmieni się wszędzie, gdzie stoi). Esc — anuluj, pusty tekst — przywróć oryginał.
          </span>
        )}
        {note && <span className="cmsbar__hint cmsbar__note">{note}</span>}
      </div>
    </>,
    document.body,
  )
}

/** Действия редактора: сохранить текст, вернуть исходный, заменить фото. */
function installActions(s: SupabaseClient, setSaving: (f: (n: number) => number) => void, setNote: (s: string) => void) {
  const track = async <T,>(p: PromiseLike<T>): Promise<T> => {
    setSaving((n) => n + 1)
    try { return await p } finally { setSaving((n) => n - 1) }
  }

  cms.actions = {
    async saveText(key, locale, value, kind) {
      const prev = cms.get().ov[locale]?.[key] ?? null
      cms.put(locale, key, { v: value, k: kind })             // сразу на экране
      const { error } = await track(s.from('site_content').upsert({ key, locale, value, kind }))
      if (error) { cms.put(locale, key, prev); setNote(`Nie zapisano: ${error.message}`) }
    },
    async revert(key, locale) {
      const prev = cms.get().ov[locale]?.[key] ?? null
      cms.put(locale, key, null)
      const { error } = await track(s.from('site_content').delete().eq('key', key).eq('locale', locale))
      if (error) { cms.put(locale, key, prev); setNote(`Nie przywrócono: ${error.message}`) }
    },
    async uploadImage(name, file, onStage) {
      try {
        onStage({ stage: 'convert', from: file.size })
        const webp = await toWebp(file, 2600, 0.84)
        onStage({ stage: 'upload', from: file.size, to: webp.size })
        const path = `img/${name}-${Date.now()}-${rid()}.webp`
        const up = await track(s.storage.from('site-media').upload(path, webp, { contentType: 'image/webp', upsert: false }))
        if (up.error) throw up.error
        const url = s.storage.from('site-media').getPublicUrl(path).data.publicUrl
        const { error } = await track(s.from('site_content').upsert({ key: `img:${name}`, locale: '*', value: url, kind: 'image' }))
        if (error) throw error
        cms.put('*', `img:${name}`, { v: url, k: 'image' })
        onStage({ stage: 'done', from: file.size, to: webp.size })
      } catch (e) {
        onStage({ stage: 'error', error: (e as Error).message === 'webp' ? 'przeglądarka nie umie WebP' : (e as Error).message })
      }
    },
  }
}
