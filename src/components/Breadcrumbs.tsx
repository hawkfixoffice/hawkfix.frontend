import { Link } from 'react-router-dom'
import { usePage } from './PageContext'
import Icon from './Icon'

export interface Crumb { name: string; to: string }

export default function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const { t } = usePage()
  return (
    <nav className="crumbs" aria-label={t.breadcrumbs.home}>
      <ol>
        {trail.map((c, i) => (
          <li key={c.to}>
            {i < trail.length - 1 ? (
              <>
                <Link to={c.to}>{c.name}</Link>
                <Icon name="chevron" size={14} />
              </>
            ) : (
              <span aria-current="page">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
