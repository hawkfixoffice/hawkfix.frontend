import Lottie from './Lottie'

/**
 * Разделительная линия под заголовком: прочерчивается слева направо, на конце
 * распускается звёздочка. Линия тянется на всю ширину (холст растягивается по
 * горизонтали, поэтому толщина обводки остаётся ровно 2px при любой ширине).
 */
export default function Rule({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const line = tone === 'dark' ? '#3a3d3b' : '#d2d2d2'
  const tip = tone === 'dark' ? '#6eefa0' : '#146b3c'
  return (
    <span className={className ? `rule ${className}` : 'rule'} aria-hidden="true">
      <Lottie name="rule" stretch width="100%" height={16} color={line} className="rule__line" />
      <Lottie name="spark" size={22} color={tip} className="rule__tip" />
    </span>
  )
}
