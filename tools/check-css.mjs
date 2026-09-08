/**
 * Простая проверка стилей: баланс скобок и отсутствие вложенных @media.
 * Ловит случай, когда правка съела закрывающую скобку — тогда весь
 * последующий CSS молча проваливается внутрь медиазапроса и не применяется.
 */
import { readdir, readFile } from 'node:fs/promises'

const dir = 'src/styles'
let bad = 0
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.css'))) {
  const src = await readFile(`${dir}/${f}`, 'utf8')
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
  const open = (noComments.match(/\{/g) || []).length
  const close = (noComments.match(/\}/g) || []).length
  if (open !== close) { console.log(`  ✗ ${f}: скобки не сходятся ({ ${open} vs } ${close})`); bad++ }

  // вложенный @media внутри @media
  let depth = 0
  for (const m of noComments.matchAll(/@media[^{]*\{|\{|\}/g)) {
    const tok = m[0]
    if (tok.startsWith('@media')) {
      if (depth > 0) { console.log(`  ✗ ${f}: @media внутри @media (позиция ${m.index})`); bad++ }
      depth++
    } else if (tok === '{') { if (depth > 0) depth++ }
    else if (tok === '}') { if (depth > 0) depth-- }
  }
}
console.log(bad ? `\nпроблем в стилях: ${bad}` : 'стили: скобки сходятся, вложенных @media нет')
process.exit(bad ? 1 : 0)
