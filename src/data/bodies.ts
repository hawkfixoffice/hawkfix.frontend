import type { PageBody } from '../lib/types'

/** Тела страниц: по одному файлу на страницу+язык. import.meta.glob делает
 *  из каждого отдельный чанк, поэтому клиент грузит только тело открытой страницы,
 *  а не текст всех 140 адресов. */
const modules = import.meta.glob<{ default: PageBody }>('../../content/bodies/*.json')

export async function loadBody(key: string, locale: string): Promise<PageBody> {
  const path = `../../content/bodies/${key}__${locale}.json`
  const mod = modules[path]
  if (!mod) return { blocks: [] }
  return (await mod()).default
}
