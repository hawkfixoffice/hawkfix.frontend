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
 * Адаптивная картинка. Явные width/height — против сдвига раскладки (CLS),
 * фон под картинкой — усреднённый цвет кадра, чтобы место не мигало белым.
 *
 * Формат один — WebP (правило проекта, см. tools/build-images.sh), поэтому
 * <picture> с запасной веткой больше не нужен: обычного <img srcset> хватает.
 * Файлы готовит tools/build-images.sh.
 */
export default function Picture({
  name, alt, ratio = '3x2', widths = [800, 1200, 1600], sizes = '(max-width: 900px) 100vw, 50vw',
  priority = false, className,
}: Props) {
  const [rw, rh] = ratio.split('x').map(Number)
  const base = widths[0]
  const tint = photos[name]?.color

  return (
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
}
