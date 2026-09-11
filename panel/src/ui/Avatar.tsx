import { initials } from '../lib/fmt'

const BASE = (import.meta.env.VITE_SUPABASE_URL || 'https://vpijumbbmwjibvlohfug.supabase.co')
  + '/storage/v1/object/public/avatars/'

/** Фотография сотрудника, а если её нет — инициалы.
 *  Бакет публичный: лицо сотрудника не секрет, зато не нужно подписывать
 *  ссылку на каждый аватар в каждом списке. */
export default function Avatar({ name, path, size = 'md' }: {
  name: string; path?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const cls = `avatar avatar--${size}`
  if (!path) return <span className={cls}>{initials(name)}</span>
  return <img className={cls} src={BASE + path} alt={name} loading="lazy" />
}
