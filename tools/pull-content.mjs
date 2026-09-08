/**
 * Выгружает контент из Supabase в content/*.json и пересобирает index+bodies.
 * Вызывается в CI перед сборкой: правки в базе так попадают на статический сайт.
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node tools/pull-content.mjs
 */
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { selectAll } from './supabase.mjs'

const LOCALES = ['pl', 'uk', 'ru', 'en']
const write = (f, d) => writeFile(`content/${f}`, JSON.stringify(d, null, 1), 'utf8')

const [pagesRows, pageTr, groupRows, groupTr, itemRows, itemTr, chainRows, chainTr, faqRows, faqTr, settingRows] =
  await Promise.all([
    selectAll('pages', '*', 'sort.asc'),
    selectAll('page_tr'),
    selectAll('price_groups', '*', 'sort.asc'),
    selectAll('price_group_tr'),
    selectAll('price_items', '*', 'sort.asc'),
    selectAll('price_item_tr'),
    selectAll('chains'),
    selectAll('chain_tr'),
    selectAll('faq', '*', 'sort.asc'),
    selectAll('faq_tr'),
    selectAll('settings'),
  ])

/** Собирает { pl: …, uk: … } из строк перевода.
 *  Порядок языков задаём явно: PostgREST отдаёт строки в произвольном порядке,
 *  а от него зависит порядок ключей в JSON и, значит, воспроизводимость сборки. */
const byLocale = (rows, keyField, key, pick) => {
  const found = rows.filter((r) => r[keyField] === key)
  return Object.fromEntries(
    LOCALES.map((l) => [l, found.find((r) => r.locale === l)])
      .filter(([, r]) => r)
      .map(([l, r]) => [l, pick(r)]),
  )
}

const pages = pagesRows.map((p) => {
  const rec = {
    key: p.key, type: p.type,
    paths: byLocale(pageTr, 'page_key', p.key, (r) => r.path),
    tr: Object.fromEntries(
      LOCALES
        .map((l) => pageTr.find((r) => r.page_key === p.key && r.locale === l))
        .filter(Boolean)
        .map((r) => [r.locale, {
        path: r.path, title: r.title, description: r.description, h1: r.h1,
        ...(r.blurb ? { blurb: r.blurb } : {}),
        blocks: r.blocks ?? [],
        ...(r.checklist ? { checklist: r.checklist } : {}),
      }]),
    ),
  }
  if (p.image) rec.image = p.image
  if (p.group_key) rec.group = p.group_key
  return rec
})

const services = pages.filter((p) => p.type === 'service')
const others = pages.filter((p) => p.type !== 'service')

const items = itemRows.map((it) => ({
  key: it.key, group: it.group_key, dept: it.dept,
  price: it.price, hours: Number(it.hours), unit: it.unit,
  min: it.min_qty, max: it.max_qty,
  ...(it.extra ?? {}),
  name: byLocale(itemTr, 'item_key', it.key, (r) => r.name),
}))

const groups = groupRows.map((g) => ({
  key: g.key, name: byLocale(groupTr, 'group_key', g.key, (r) => r.name),
}))

const chains = chainRows.map((c) => ({
  key: c.key, trigger: c.trigger, visits: c.visits, minPrice: c.min_price, steps: c.steps,
  name: byLocale(chainTr, 'chain_key', c.key, (r) => r.name),
  unless: byLocale(chainTr, 'chain_key', c.key, (r) => r.unless_text),
}))

const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]))
const settings = {
  minVisit: s.minVisit, minVisitBy: s.minVisitBy,
  urgentPct: s.urgentPct, urgentMax: s.urgentMax,
  workDays: s.workDays, currency: s.currency,
  units: s.units, strings: s.strings,
}

const faq = Object.fromEntries(LOCALES.map((l) => [l, {
  heading: '',
  items: faqRows.map((f) => {
    const t = faqTr.find((r) => r.faq_key === f.key && r.locale === l)
    return t ? { q: t.question, a: t.answer } : null
  }).filter(Boolean),
}]))
// Заголовок блока вопросов живёт в теле страницы «О нас» — берём оттуда
for (const l of LOCALES) {
  const about = pages.find((p) => p.type === 'about')
  const blocks = about?.tr[l]?.blocks ?? []
  const idx = blocks.findIndex((b, i) => b.type === 'h2' &&
    blocks.slice(i + 1, i + 4).some((x) => x.type === 'list' && x.items.length >= 8))
  if (idx >= 0) faq[l].heading = blocks[idx].text
}

await Promise.all([
  write('pages.json', others),
  write('services.json', services),
  write('items.json', items),
  write('groups.json', groups),
  write('chains.json', chains),
  write('settings.json', settings),
  write('faq.json', faq),
])

console.log(`выгружено: ${others.length} страниц, ${services.length} услуг, ${items.length} позиций, ${chains.length} цепочек`)
execFileSync('node', ['tools/split-content.mjs'], { stdio: 'inherit' })
