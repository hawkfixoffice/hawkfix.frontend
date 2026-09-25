import { useRef, useState } from 'react'
import { photos } from '../data/content'
import { cms, useCms, type UploadStage } from '../cms/store'
import UploadStatus from '../cms/UploadStatus'

type Ratio = '3x2' | '4x3' | '16x9' | '1x1'

interface Props {
  name: string
  alt: string
  ratio?: Ratio
  widths?: number[]
  sizes?: string
  priority?: boolean
  className?: string
}

/**
 * Адаптивная картинка. Явные width/height — против сдвига раскладки (CLS),
 * фон под картинкой — усреднённый цвет кадра, чтобы место не мигало белым.
 *
 * Формат один — WebP (правило проекта, см. tools/build-images.sh), поэтому
 * <picture> с запасной веткой больше не нужен: обычного <img srcset> хватает.
 * Файлы готовит tools/build-images.sh.
 *
 * Фото можно заменить в визуальном редакторе: правка `img:<name>` хранит
 * адрес WebP в Storage, и замена действует везде, где стоит это фото.
 */
export default function Picture({
  name, alt, ratio = '3x2', widths = [800, 1200, 1600], sizes = '(max-width: 900px) 100vw, 50vw',
  priority = false, className,
}: Props) {
  const { ov, editing } = useCms()
  const [st, setSt] = useState<UploadStage | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [rw, rh] = ratio.split('x').map(Number)
  const base = widths[0]
  const tint = photos[name]?.color
  const custom = ov['*']?.[`img:${name}`]?.v

  const img = custom ? (
    <img
      className={className} src={custom} alt={alt}
      width={base} height={Math.round((base * rh) / rw)}
      loading={priority ? 'eager' : 'lazy'} decoding="async"
      style={tint ? { backgroundColor: tint } : undefined}
    />
  ) : (
    <img
      className={className}
      src={`/img/out/${name}-${base}.webp`}
      srcSet={widths.map((w) => `/img/out/${name}-${w}.webp ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      width={base}
      height={Math.round((base * rh) / rw)}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      style={tint ? { backgroundColor: tint } : undefined}
    />
  )

  if (!editing) return img

  const open = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); input.current?.click() }
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !cms.actions) return
    await cms.actions.uploadImage(name, file, setSt)
    window.setTimeout(() => setSt(null), 6000)
  }

  // display: contents — обёртка не добавляет своего бокса, раскладка
  // картинки та же, что без редактора; значок ложится в ближайшего
  // позиционированного предка.
  return (
    <span data-cms-img="" style={{ display: 'contents' }} onClick={open}>
      {img}
      <span className="cms-imgtag" aria-hidden="true">{custom ? '▲ Zdjęcie · zmienione' : '▲ Zdjęcie'}</span>
      {st && <span className="cms-imgst"><UploadStatus st={st} /></span>}
      <input ref={input} type="file" accept="image/*" hidden onChange={onPick} onClick={(e) => e.stopPropagation()} />
    </span>
  )
}
