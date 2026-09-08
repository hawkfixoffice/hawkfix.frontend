import type { Block } from '../lib/types'
import Icon from './Icon'

/** Рендер контентных блоков, извлечённых со старого сайта.
 *  Тексты не переписываем — только раскладываем в новую вёрстку. */
export default function Blocks({ blocks, skipImages = true }: { blocks: Block[]; skipImages?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{b.text}</p>
        if (b.type === 'list')
          return (
            <ul className="checklist" key={i}>
              {b.items.map((x, j) => (
                <li key={j}><Icon name="check" size={16} /><span>{x}</span></li>
              ))}
            </ul>
          )
        if (b.type === 'image') return skipImages ? null : <img key={i} src={b.src} alt={b.alt} />
        const Tag = b.type as 'h2' | 'h3' | 'h4'
        return <Tag key={i}>{b.text}</Tag>
      })}
    </>
  )
}
