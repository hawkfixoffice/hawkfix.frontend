# HAWK.FIX — сайт

Новый сайт `hawkfix.pl`: «złota rączka» в Варшаве, 4 языка, 140 страниц.
Фронтенд — статика на GitHub Pages, контент и заявки — Supabase.

Тексты и эталон SEO взяты со старого сайта: его полная копия и разбор лежат
в `PROJEKTY/HAWKFIX/old-site/` рядом с этим репозиторием.

## Как устроено

```
hawkfix.frontend/            ← этот репозиторий
├── content/                 ← контент: индекс, тела страниц, прайс (генерится)
├── public/                  ← шрифты, фото, og, иконки
├── src/                     ← компоненты, страницы, SEO, калькулятор
├── tools/                   ← скрипты: контент, картинки, аудит, скриншоты
├── supabase/
│   ├── migrations/          ← схема БД
│   ├── functions/lead/      ← edge-функция приёма заявок
│   └── q.sh                 ← выполнить SQL через Management API
├── .github/workflows/       ← деплой на GitHub Pages
└── dist/                    ← сборка (в git не попадает)
```

Копия старого сайта и разбор его SEO лежат рядом с репозиторием, в
`PROJEKTY/HAWKFIX/old-site/` — это справочный материал (12 МБ), в репозиторий он
намеренно не добавлен. Если нужен в истории — скажи, добавлю.

### Почему SSG, а не SPA

GitHub Pages отдаёт только статику, а SEO-требования жёсткие: у каждого из 140 адресов
должен быть собственный HTML с уникальными `title`/`description`, `canonical`, пятью
`hreflang` и JSON-LD. Поэтому `vite-react-ssg` пререндерит все маршруты в отдельные
`index.html`, а React уже гидратирует готовую страницу.

Маршруты перечислены явно (не через `:slug`) — так мета-разметка каждой страницы
под полным контролем.

### Как контент попадает на сайт

```
Supabase ──(npm run content:pull)──> content/*.json ──(split)──> index.json + bodies/*.json ──> сборка
```

`index.json` (70 КБ) — лёгкий справочник путей и заголовков, нужен каждой странице.
`bodies/*.json` — тела страниц, по файлу на страницу+язык, грузятся отдельным чанком
только для открытого адреса. **Без этого разделения весь текст всех 140 страниц
(747 КБ) уезжал в клиентский бандл.**

Обратное направление — `npm run content:push` (залить локальные файлы в базу).
Round-trip проверен: выгрузка из базы даёт байт в байт тот же `index.json`.

## Команды

```bash
npm install
npm run dev            # разработка
npm run build          # сборка 140 страниц + sitemap/robots/404/CNAME
npm run preview        # посмотреть собранное

npm run content:pull   # Supabase → content/   (нужны SUPABASE_URL и SUPABASE_SERVICE_KEY)
npm run content:push   # content/ → Supabase
npm run assets:photos  # подобрать фото с Unsplash
sh tools/build-images.sh   # адаптивные webp/jpg из public/img
node tools/make-og.mjs     # og-картинки 1200×630 на 4 языка

python3 tools/audit-seo.py     # аудит SEO по всем страницам сборки
python3 tools/check-parity.py  # сверка: весь ли текст старого сайта перенесён
node tools/e2e.mjs http://localhost:4173 /tmp   # калькулятор + форма + Lottie
```

## Переменные окружения

| Переменная | Где | Зачем |
|---|---|---|
| `VITE_LEAD_ENDPOINT` | сборка фронта | URL edge-функции приёма заявок. Публичный. |
| `SUPABASE_URL` | локально, CI | Адрес проекта. |
| `SUPABASE_SERVICE_KEY` | локально, CI | **Секрет.** Только для синхронизации контента. В бандл не попадает. |
| `SUPABASE_PAT` | локально | Management API: миграции через `supabase/q.sh`. |

Шаблон — в `.env.example`. Реальные значения: локально в `.env.local`,
в GitHub — Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) и Variables (`VITE_LEAD_ENDPOINT`).

## Бэкенд

13 таблиц: контент по языкам (`pages`/`page_tr`), прайс (`price_items`, 105 позиций),
цепочки работ, вопросы, настройки, заявки.

**RLS включён везде.** У контентных таблиц — только публичное чтение.
**У `leads` нет ни одной политики**: анонимный ключ не может ни прочитать заявки, ни
записать их (проверено — 401). Единственный путь записи — edge-функция `lead`,
работающая на service-ключе. Она же проверяет телефон, ловит ботов скрытым полем
и умеет Cloudflare Turnstile (включается заданием `TURNSTILE_SECRET`).

## Деплой

Пуш в `main` запускает сборку и публикацию на GitHub Pages.
Workflow проверяет, что собралось ≥140 страниц и на месте `sitemap.xml`, `robots.txt`,
`404.html`, `CNAME` — иначе падает, не публикуя.

Пересобрать после правки контента в базе: вкладка Actions → Run workflow,
либо `repository_dispatch` с типом `content-updated` (например, из вебхука Supabase).

**Домен.** В `dist/CNAME` записан `hawkfix.pl`. Для корневого домена в DNS нужны
A-записи GitHub Pages (`185.199.108–111.153`) или ALIAS. Если домен остаётся за
Cloudflare — проксирование можно оставить, оно добавит brotli и кэш.

## Что осталось сделать вручную

1. Создать репозиторий на GitHub и включить Pages (Source: GitHub Actions).
2. Задать Secrets/Variables (см. таблицу выше).
3. Перевести DNS `hawkfix.pl` на GitHub Pages.
4. Решить по Turnstile и аналитике — сейчас обе выключены, как и на старом сайте.
5. Проверить два телефона: для звонка `+48 532 481 505`, в WhatsApp `735 369 350`
   (расхождение унаследовано со старого сайта).

## Фотографии

Подобраны с Unsplash (свободная лицензия, платные `plus.` отсеяны).
Авторы и ссылки — в `content/photos.json`.
