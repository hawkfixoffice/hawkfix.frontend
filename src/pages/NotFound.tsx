import { Head } from 'vite-react-ssg'

/** 404 без привязки к языку: GitHub Pages отдаёт 404.html для любого пути. */
export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 — HAWK.FIX</title>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <section className="band notfound">
        <div className="wrap">
          
          <h1>Nie ma takiej strony<br />· Сторінки немає · Страницы нет · Page not found</h1>
          <p className="prose">
            Sprawdź adres albo wróć na stronę główną. · Перевірте адресу або поверніться на головну. ·
            Проверьте адрес или вернитесь на главную. · Check the address or go back to the homepage.
          </p>
          <div className="pagehead__actions">
            <a className="btn btn--primary" href="/">HAWK.FIX</a>
            <a className="btn btn--ghost" href="/uslugi/">Usługi</a>
            <a className="btn btn--ghost" href="/en/services/">Services</a>
          </div>
        </div>
      </section>
    </>
  )
}
