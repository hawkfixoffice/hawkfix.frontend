import { usePage } from '../components/PageContext'
import { CtaBand, MainActions, PageHead, ServiceRows } from '../components/Simple'

/** Хаб услуг: заголовок и все услуги крупными строками с ценой «от». */
export default function ServicesHub() {
  const { page, locale } = usePage()
  return (
    <>
      <PageHead lead={page.tr[locale].description} actions={<MainActions />} />
      <section className="s-band s-band--first">
        <div className="wrap">
          <ServiceRows heading="h2" />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
