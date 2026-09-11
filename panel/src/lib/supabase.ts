import { createClient } from '@supabase/supabase-js'

/** Публичные параметры проекта. Ключ публикуемый: всё, что он может, —
 *  ограничено политиками RLS, поэтому его место в браузере. */
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://vpijumbbmwjibvlohfug.supabase.co'
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FrahMhP9wLVvccioUMnjSQ_wSr3Qnth'

export const sb = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hawkfix.panel.auth' },
})

/** Вход по нику. Почты у сотрудников нет — GoTrue требует адрес,
 *  поэтому нику подставляется технический домен. Человек его не видит. */
export const staffEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/\s+/g, '.')}@staff.hawkfix.pl`

export async function signIn(username: string, password: string) {
  const { error } = await sb.auth.signInWithPassword({ email: staffEmail(username), password })
  if (error) throw error
}

export const signOut = () => sb.auth.signOut()

export type Role = 'admin' | 'manager' | 'master'

export interface Me {
  id: string
  username: string
  full_name: string
  role: Role
  phone: string | null
  capacity: number
  active: boolean
  avatar_path: string | null
}
