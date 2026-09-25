import type { Block } from '../lib/types'
import Icon from './Icon'
import { PT } from '../cms/E'

/** Рендер контентных блоков, извлечённых со старого сайта.
 *  Тексты не переписываем — только раскладываем в новую вёрстку.
 *  editable — абзацы, заголовки и пункты списков правятся в визуальном редакторе. */
export default function Blocks({ blocks, skipImages = true, editable = false }: {
  blocks: Block[]; skipImages?: boolean; editable?: boolean
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'p') return editable ? <PT as="p" key={i} v={b.text} multiline /> : <p key={i}>{b.text}</p>
        if (b.type === 'list')
          return (
            <ul className="checklist" key={i}>
              {b.items.map((x, j) => (
                <li key={j}><Icon name="check" size={16} />{editable ? <PT v={x} multiline /> : <span>{x}</span>}</li>
              ))}
            </ul>
          )
        if (b.type === 'image') return skipImages ? null : <img key={i} src={b.src} alt={b.alt} />
        const Tag = b.type as 'h2' | 'h3' | 'h4'
        return editable ? <PT as={Tag} key={i} v={b.text} /> : <Tag key={i}>{b.text}</Tag>
      })}
    </>
  )
}
