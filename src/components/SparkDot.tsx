import Lottie from './Lottie'
import Icon from './Icon'

/**
 * Кружок бейджа со звёздочкой из логотипа: точка раскрывается в шесть лучей,
 * когда бейдж появляется в кадре, и проигрывается заново при наведении.
 * Тот же мотив, что у точки в HAWK.FIX — см. BrandMark.
 */
export default function SparkDot({ tone = 'forest', size = 34 }: { tone?: 'forest' | 'accent' | 'light'; size?: number }) {
  const color = tone === 'accent' ? '#6eefa0' : tone === 'light' ? '#ffffff' : '#1a4a2e'
  return (
    <Lottie
      name="spark" size={size} color={color} hover=".badge, .btn-round, .panel, .blk"
      still={<Icon name="spark" size={Math.round(size * 0.55)} />}
    />
  )
}
