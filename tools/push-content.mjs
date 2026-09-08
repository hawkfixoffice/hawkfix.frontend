/**
 * Заливает локальный content/ в Supabase. Запускается вручную при заведении
 * или когда контент правился в файлах, а не в базе.
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node tools/push-content.mjs
 */
import { readFile } from 'node:fs/promises'
import { upsert } from './supabase.mjs'

const read = async (f) => JSON.parse(await readFile(`content/${f}`, 'utf8'))
const LOCALES = ['pl', 'uk', 'ru', 'en']

const [pages, services, items, chains, groups, settings, faq] = await Promise.all(
  ['pages.json', 'services.json', 'items.json', 'chains.json', 'groups.json', 'settings.json', 'faq.json'].map(read),
)
const allPages = [...pages, ...services]

const log = (t, n) => console.log(`  ${t.padEnd(16)} ${String(n).padStart(4)}`)

// --- языки ---
log('locales', await upsert('locales', [
  { code: 'pl', hreflang: 'pl-PL', og_locale: 'pl_PL', title: 'Polski', is_default: true, sort: 1 },
  { code: 'uk', hreflang: 'uk-UA', og_locale: 'uk_UA', title: 'Українська', is_default: false, sort: 2 },
  { code: 'ru', hreflang: 'ru', og_locale: 'ru_RU', title: 'Русский', is_default: false, sort: 3 },
  { code: 'en', hreflang: 'en', og_locale: 'en_US', title: 'English', is_default: false, sort: 4 },
], 'code'))

// --- группы прайса (до страниц: на них ссылается pages.group_key) ---
log('price_groups', await upsert('price_groups',
  groups.map((g, i) => ({ key: g.key, sort: i })), 'key'))
log('price_group_tr', await upsert('price_group_tr',
  groups.flatMap((g) => LOCALES.filter((l) => g.name[l]).map((l) => ({ group_key: g.key, locale: l, name: g.name[l] }))),
  'group_key,locale'))

// --- страницы ---
log('pages', await upsert('pages', allPages.map((p, i) => ({
  key: p.key, type: p.type, image: p.image ?? null,
  group_key: p.group || null, sort: i,
})), 'key'))

log('page_tr', await upsert('page_tr', allPages.flatMap((p) =>
  LOCALES.filter((l) => p.tr[l]).map((l) => ({
    page_key: p.key, locale: l,
    path: p.tr[l].path, title: p.tr[l].title, description: p.tr[l].description,
    h1: p.tr[l].h1, blurb: p.tr[l].blurb ?? null,
    blocks: p.tr[l].blocks ?? [], checklist: p.tr[l].checklist ?? null,
  })),
), 'page_key,locale', 60))

// --- позиции прайса ---
log('price_items', await upsert('price_items', items.map((it, i) => ({
  key: it.key, group_key: it.group, dept: it.dept ?? '',
  price: it.price, hours: it.hours, unit: it.unit,
  min_qty: it.min ?? 1, max_qty: it.max ?? 99,
  extra: Object.fromEntries(['a', 'au', 's', 'su', 'wet', 'dry'].filter((k) => k in it).map((k) => [k, it[k]])),
  sort: i,
})), 'key'))
log('price_item_tr', await upsert('price_item_tr',
  items.flatMap((it) => LOCALES.map((l) => ({ item_key: it.key, locale: l, name: it.name[l] }))),
  'item_key,locale'))

// --- цепочки ---
log('chains', await upsert('chains', chains.map((c) => ({
  key: c.key, trigger: c.trigger, steps: c.steps, visits: c.visits ?? 1, min_price: c.minPrice ?? 0,
})), 'key'))
log('chain_tr', await upsert('chain_tr',
  chains.flatMap((c) => LOCALES.map((l) => ({ chain_key: c.key, locale: l, name: c.name[l] ?? '', unless_text: c.unless[l] ?? '' }))),
  'chain_key,locale'))

// --- вопросы ---
const faqKeys = faq.pl.items.map((_, i) => `q${i + 1}`)
log('faq', await upsert('faq', faqKeys.map((k, i) => ({ key: k, sort: i })), 'key'))
log('faq_tr', await upsert('faq_tr',
  LOCALES.flatMap((l) => faq[l].items.map((x, i) => ({ faq_key: faqKeys[i], locale: l, question: x.q, answer: x.a }))),
  'faq_key,locale'))

// --- настройки ---
log('settings', await upsert('settings', [
  { key: 'minVisit', value: settings.minVisit, note: 'Минимальная стоимость выезда, zł' },
  { key: 'minVisitBy', value: settings.minVisitBy, note: 'Минимум по направлениям: fix/clean/move/garden' },
  { key: 'urgentPct', value: settings.urgentPct, note: 'Наценка за срочность, %' },
  { key: 'urgentMax', value: settings.urgentMax, note: 'Потолок наценки за срочность, zł' },
  { key: 'workDays', value: settings.workDays, note: 'Рабочие дни недели (1=пн)' },
  { key: 'currency', value: settings.currency, note: 'Валюта' },
  { key: 'units', value: settings.units, note: 'Названия единиц по языкам' },
  { key: 'strings', value: settings.strings, note: 'Строки калькулятора по языкам' },
], 'key'))

console.log('\nконтент залит')
