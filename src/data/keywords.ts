import kwJson from '../../content/keywords.json'
import type { Locale } from '../lib/types'

/** Карта поисковых запросов: страница → язык → запросы.
 *  Собирается tools/build-keywords.py. Используется в schema.org `keywords`,
 *  мета-теге и alt-текстах. */
export const keywords = kwJson as unknown as Record<string, Partial<Record<Locale, string[]>>>
