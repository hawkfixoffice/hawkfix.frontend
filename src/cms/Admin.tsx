import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cms, loadLiveOverrides, plain, sanitize, useCms, type Ov } from './store'
import { PANEL_AUTH_KEY, SUPA_KEY, SUPA_URL } from '../lib/supa'
import { rid, toWebp } from '../lib/webp'
import { translateAll, translateError, type Target } from '../lib/translate'
import { usePage } from '../components/PageContext'
import Toolbar from './Toolbar'
import PublishDialog from './PublishDialog'

/**
 * Модуль администратора на сайте. Грузится отдельным чанком и только тогда,
 * когда в браузере есть сессия панели (см. CmsBoot): посетитель не качает
 * ни supabase-js, ни редактор.
 *
 * Правка — только на польской версии. Изменения копятся черновиком
 * (`site_content_draft`), посетитель их не видит. «Opublikuj» переводит
 * польские тексты на uk/ru/en (edge `translate` → Barabash AI) и только
 * потом публикует всё разом (`site_publish_drafts`), затем просит GitHub
 * пересобрать статический HTML для поисковиков.
 *
 * Права проверяет база: писать черновики и публиковать может только is_admin().
 */
let sb: SupabaseClient | null = null
const client = () => (sb ??= createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: PANEL_AUTH_KEY },
}))

const LS_EDIT = 'hawkfix.cms.editing'

async function loadDrafts(s: SupabaseClient) {
  const { data } = await s.from('site_content_draft').select('key, value, kind')
  const drafts: Record<string, Ov> = {}
  for (const r of data ?? []) drafts[r.key] = { v: r.value, k: r.kind }
  cms.set({ drafts })
}

export default function Admin() {
  const { admin, editing, drafts } = useCms()
  const { page, locale } = usePage()
  const [who, setWho] = useState('')
  const [saving, setSaving] = useState(0)
  const [note, setNote] = useState('')
  const [publish, setPublish] = useState(false)

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
      await loadDrafts(s)
      let on = false
      try { on = sessionStorage.getItem(LS_EDIT) === '1' || new URLSearchParams(location.search).has('edit') } catch { /* */ }
      cms.set({ admin: true, editing: on })
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(LS_EDIT, editing ? '1' : '0') } catch { /* */ }
    document.documentElement.toggleAttribute('data-cms-editing', editing && locale === 'pl')
  }, [editing, locale])

  if (!admin) return null
  const pending = Object.entries(drafts)

  return createPortal(
    <>
      {editing && locale === 'pl' && <Toolbar />}
      <div className="cmsbar" role="region" aria-label="Edytor strony">
        <span className="cmsbar__who">HAWK.FIX · {who}</span>
        <button type="button" className={`cmsbar__btn${editing ? ' on' : ''}`} onClick={() => cms.set({ editing: !editing })}>
          {editing ? '✓ Edycja włączona' : '✎ Edytuj stronę'}
        </button>
        <button type="button" className={`cmsbar__btn${pending.length ? ' cmsbar__btn--pub' : ''}`}
                onClick={() => setPublish(true)} disabled={!pending.length}>
          ⇪ Opublikuj{pending.length ? ` (${pending.length})` : ''}
        </button>
        <a className="cmsbar__btn" href="/panel/#/prices">Cennik w panelu</a>
        {saving > 0 && <span className="cmsbar__who">Zapisuję…</span>}
        {editing && locale !== 'pl' && (
          <span className="cmsbar__hint cmsbar__note">
            Tekst zmieniasz tylko po polsku — pozostałe języki tłumaczą się same przy publikacji.{' '}
            <a href={`${page.paths.pl}?edit=1`}>Przejdź do wersji polskiej →</a>
          </span>
        )}
        {editing && locale === 'pl' && (
          <span className="cmsbar__hint">
            Kliknij tekst, żeby go zmienić; zaznacz fragment — pojawi się pasek stylów; kliknij zdjęcie, żeby je podmienić (WebP).
            Zmiany są wersją roboczą: klienci zobaczą je po „Opublikuj” — wtedy przetłumaczymy je na UK, RU i EN.
          </span>
        )}
        {note && <span className="cmsbar__hint cmsbar__note">{note}</span>}
      </div>

      {publish && (
        <PublishDialog
          title="Publikacja strony"
          rebuild
          changes={pending.map(([key, d]) => ({
            kind: d.k,
            label: d.k === 'image' ? key.replace(/^img:/, 'zdjęcie: ')
              : d.k === 'reset' ? `przywróć oryginał: ${key}` : plain(d.v).slice(0, 90),
          }))}
          run={(report) => publishAll(client(), pending, report)}
          onClose={(done) => {
            setPublish(false)
            if (done) { setNote('Opublikowane. Wersja dla wyszukiwarek odświeży się za 2–3 minuty.'); loadLiveOverrides(true) }
          }}
        />
      )}
    </>,
    document.body,
  )
}

/** Перевести и опубликовать все черновики. Ошибка на любом шаге —
 *  исключение: окно покажет его, а черновики останутся на месте. */
async function publishAll(
  s: SupabaseClient,
  pending: [string, Ov][],
  report: (p: { stage?: 'translate' | 'publish' | 'rebuild'; done?: Record<Target, number>; total?: number }) => void,
) {
  const texts = pending.filter(([, d]) => d.k === 'text' || d.k === 'html')
  report({ stage: 'translate', total: texts.length })

  const invoke = async (to: Target, list: string[]) => {
    const { data, error } = await s.functions.invoke('translate', { body: { to, texts: list } })
    if (error || data?.error || !Array.isArray(data?.out)) {
      let code = data?.error ?? error?.message ?? 'unknown'
      // supabase-js прячет тело ответа с ошибкой в context
      try { code = (await (error as any)?.context?.json())?.error ?? code } catch { /* */ }
      throw new Error(translateError(String(code)))
    }
    return data.out as string[]
  }
  const tr = await translateAll(texts.map(([, d]) => d.v), invoke, (done) => report({ done }))

  report({ stage: 'publish' })
  const rows = pending.map(([key, d]) => {
    if (d.k === 'reset') return { key, kind: 'reset' }
    if (d.k === 'image') return { key, kind: 'image', value: d.v }
    const i = texts.findIndex(([k]) => k === key)
    const fix = (x: string) => (d.k === 'html' ? sanitize(x) : plain(x))
    return { key, kind: d.k, values: { pl: d.v, uk: fix(tr.uk[i]), ru: fix(tr.ru[i]), en: fix(tr.en[i]) } }
  })
  const { error } = await s.rpc('site_publish_drafts', { rows })
  if (error) throw new Error(`Publikacja nie powiodła się: ${error.message}`)
  await loadDrafts(s)

  report({ stage: 'rebuild' })
  // Живой сайт уже показывает новое; пересборка нужна для HTML поисковиков.
  // Её сбой публикацию не отменяет.
  await s.functions.invoke('site-publish', { body: {} }).catch(() => {})
}

/** Действия редактора: черновик текста, возврат исходного, замена фото. */
function installActions(s: SupabaseClient, setSaving: (f: (n: number) => number) => void, setNote: (s: string) => void) {
  const track = async <T,>(p: PromiseLike<T>): Promise<T> => {
    setSaving((n) => n + 1)
    try { return await p } finally { setSaving((n) => n - 1) }
  }
  const putDraft = (key: string, d: Ov | null) => {
    const drafts = { ...cms.get().drafts }
    if (d) drafts[key] = d; else delete drafts[key]
    cms.set({ drafts })
  }

  cms.actions = {
    async saveText(key, value, kind) {
      const prev = cms.get().drafts[key] ?? null
      const published = cms.get().ov.pl?.[key]?.v
      // Вернули ровно опубликованный текст — черновик больше не нужен
      if (published !== undefined && published === value) return cms.actions!.revert(key)
      putDraft(key, { v: value, k: kind })
      const { error } = await track(s.from('site_content_draft').upsert({ key, value, kind }))
      if (error) { putDraft(key, prev); setNote(`Nie zapisano: ${error.message}`) }
    },
    async revert(key) {
      const prev = cms.get().drafts[key] ?? null
      const published = !!cms.get().ov.pl?.[key] || !!cms.get().ov['*']?.[key]
      if (published) {
        // Есть опубликованная правка — при публикации её надо снять на всех языках
        putDraft(key, { v: '', k: 'reset' })
        const { error } = await track(s.from('site_content_draft').upsert({ key, value: '', kind: 'reset' }))
        if (error) { putDraft(key, prev); setNote(`Nie zapisano: ${error.message}`) }
      } else {
        putDraft(key, null)
        const { error } = await track(s.from('site_content_draft').delete().eq('key', key))
        if (error) { putDraft(key, prev); setNote(`Nie przywrócono: ${error.message}`) }
      }
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
        const key = `img:${name}`
        const { error } = await track(s.from('site_content_draft').upsert({ key, value: url, kind: 'image' }))
        if (error) throw error
        putDraft(key, { v: url, k: 'image' })
        onStage({ stage: 'done', from: file.size, to: webp.size })
      } catch (e) {
        onStage({ stage: 'error', error: (e as Error).message === 'webp' ? 'przeglądarka nie umie WebP' : (e as Error).message })
      }
    },
  }
}
