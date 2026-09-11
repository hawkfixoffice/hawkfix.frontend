# Панель HAWK.FIX

Отдельное SPA, живёт по адресу `/panel/` на том же домене, что и сайт.

## Как открыть локально

```bash
npm run dev:panel     # http://localhost:5174/panel/  — только панель, с горячей перезагрузкой
npm run dev           # http://localhost:5173/        — только сайт (панели там нет)

npm run build && npm run preview
#                     http://localhost:4173/panel/    — всё как в бою: сайт и панель вместе
```

`npm run dev` поднимает сборку сайта (vite-react-ssg) и о панели не знает —
`localhost:5173/panel` отдаст 404 сайта. Это две разные сборки, так и задумано:
у сайта статическая генерация ради SEO, у панели обычный SPA.

## Как попадает на сервер

`npm run build` собирает сайт, затем `npm run build:panel` кладёт панель
в `dist/panel`. GitHub Actions выкатывает `dist` целиком, поэтому панель
появляется по адресу `<домен сборки>/panel/` — сейчас это
`https://hawnfix.barabashflow.pl/panel/`, после переезда DNS будет
`https://hawkfix.pl/panel/`.

`robots.txt` закрывает `/panel/`, в `index.html` панели стоит `noindex`.

## Вход

Логин и пароль, без почты. Первый администратор — `Admin`.
Остальных заводит администратор во вкладке «Команда».
