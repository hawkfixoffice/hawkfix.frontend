import { useEffect } from 'react'

export default function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-label={title}>
        <div className="card__head"><h2 className="h2">{title}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}
