/** Публичные параметры проекта Supabase для сайта. Ключ публикуемый:
 *  всё, что он умеет, ограничено политиками RLS. supabase-js на сайт не
 *  тянем — посетителю хватает двух fetch, а клиент библиотеки грузится
 *  отдельным чанком только администратору (см. src/cms/Admin.tsx). */
export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vpijumbbmwjibvlohfug.supabase.co'
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FrahMhP9wLVvccioUMnjSQ_wSr3Qnth'

export const anonHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }

/** Ключ, под которым панель хранит сессию. Сайт и панель на одном домене,
 *  поэтому администратор, вошедший в панель, узнаётся на сайте без второго входа. */
export const PANEL_AUTH_KEY = 'hawkfix.panel.auth'
