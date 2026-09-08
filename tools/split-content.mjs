/**
 * Делит контент на две части:
 *  index.json  — лёгкий справочник (пути, заголовки, врезки, картинки).
 *                Нужен каждой странице: навигация, подвал, карточки услуг.
 *  bodies/*.json — тяжёлые тела (blocks, checklist) по одному файлу на
 *                страницу+язык. Грузятся только для открытого маршрута.
 *
 * Без этого весь текст всех 140 страниц уезжал в клиентский бандл (747 КБ).
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'

const read = async (f) => JSON.parse(await readFile(f, 'utf8'))
const pages = await read('content/pages.json')
const services = await read('content/services.json')
const all = [...pages, ...services]

await rm('content/bodies', { recursive: true, force: true })
await mkdir('content/bodies', { recursive: true })

const index = []
let bodyBytes = 0

/**
 * Ключевые слова для поиска по прайсу.
 * Люди ищут «kran», а позиция называется «Wymiana lub montaż baterii» —
 * без синонимов запрос даёт ноль. Слова берём из текста страницы услуги,
 * привязанной к той же группе прайса, ничего не выдумывая.
 */
const groupWords = {}
for (const s of services) {
  if (!s.group) continue
  for (const [loc, tr] of Object.entries(s.tr)) {
    const words = [tr.h1, tr.blurb ?? '', ...(tr.checklist ?? [])].join(' ')
    groupWords[s.group] ??= {}
    groupWords[s.group][loc] = words.toLocaleLowerCase(loc)
  }
}
await writeFile('content/group-words.json', JSON.stringify(groupWords, null, 1), 'utf8')
console.log(`group-words:  ${Object.keys(groupWords).length} групп`)

for (const p of all) {
  const light = { key: p.key, type: p.type, paths: p.paths, tr: {} }
  if (p.image) light.image = p.image
  if (p.group) light.group = p.group

  for (const [loc, tr] of Object.entries(p.tr)) {
    // canonical / ogImage / ogLocale не храним — они выводятся из пути и языка
    light.tr[loc] = {
      path: tr.path, title: tr.title, description: tr.description, h1: tr.h1,
      ...(tr.blurb ? { blurb: tr.blurb } : {}),
    }
    const body = { blocks: tr.blocks, ...(tr.checklist ? { checklist: tr.checklist } : {}) }

    // У страниц услуг вытаскиваем два содержательных абзаца, которые иначе
    // терялись бы в новой вёрстке: описание проблемы (до чек-листа) и
    // примечание о ценах (после него). Остальные блоки — навигация и CTA,
    // они в новом дизайне собираются заново.
    if (p.type === 'service') {
      const bl = tr.blocks
      const listIdx = bl.findIndex((b) => b.type === 'list')
      const h2Idx = bl.findIndex((b) => b.type === 'h2')
      if (listIdx > 0) {
        // listIdx - 1 — это подпись «Co wchodzi», её отбрасываем
        body.intro = bl.slice(1, listIdx - 1).filter((b) => b.type === 'p').map((b) => b.text)
        body.note = bl.slice(listIdx + 1, h2Idx === -1 ? undefined : h2Idx)
          .filter((b) => b.type === 'p').map((b) => b.text)
      }
    }
    const json = JSON.stringify(body)
    bodyBytes += json.length
    await writeFile(`content/bodies/${p.key}__${loc}.json`, json, 'utf8')
  }
  index.push(light)
}

await writeFile('content/index.json', JSON.stringify(index, null, 1), 'utf8')
const idxBytes = (await readFile('content/index.json')).length
console.log(`index.json:  ${(idxBytes / 1024).toFixed(1)} KB  (${index.length} страниц)`)
console.log(`bodies/:     ${(bodyBytes / 1024).toFixed(1)} KB в ${all.length * 4} файлах, в среднем ${(bodyBytes / (all.length * 4) / 1024).toFixed(1)} KB`)
