import { photos } from '../data/content'

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
 * Адаптивная картинка: webp с jpg-фолбэком, явные width/height против сдвига
 * раскладки (CLS). Файлы готовит tools/build-images.sh.
 */
export default function Picture({
  name, alt, ratio = '3x2', widths = [800, 1200], sizes = '(max-width: 900px) 100vw, 50vw',
  priority = false, className,
}: Props) {
  const [rw, rh] = ratio.split('x').map(Number)
  const base = widths[0]
  const srcset = (ext: string) => widths.map((w) => `/img/out/${name}-${w}.${ext} ${w}w`).join(', ')
  const tint = photos[name]?.color

  return (
    <picture className={className}>
      <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
      <img
        src={`/img/out/${name}-${base}.jpg`}
        srcSet={srcset('jpg')}
        sizes={sizes}
        alt={alt}
        width={base}
        height={Math.round((base * rh) / rw)}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        style={tint ? { backgroundColor: tint } : undefined}
      />
    </picture>
  )
}
