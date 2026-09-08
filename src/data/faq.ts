import faqJson from '../../content/faq.json'
import type { Locale } from '../lib/types'

export interface Faq { heading: string; items: { q: string; a: string }[] }
export const faq = faqJson as unknown as Record<Locale, Faq>
