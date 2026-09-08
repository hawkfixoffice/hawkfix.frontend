/**
 * Плавно раскрывающийся блок без замеров высоты: внешний grid переходит
 * из 0fr в 1fr, внутренний ряд с min-height: 0 подрезает содержимое.
 * Содержимое всегда в DOM — для поисковика и для печати.
 */
export default function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div className="collapse" data-open={open} id={id} role="region" aria-hidden={!open}>
      <div className="collapse__in">{children}</div>
    </div>
  )
}
