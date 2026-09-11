import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Панель — отдельное SPA, живёт по адресу /panel/ и собирается в dist/panel.
 *  Сайт остаётся статическим (vite-react-ssg): у панели своя сборка,
 *  иначе её роуты попали бы в sitemap и в индекс. */
export default defineConfig({
  root: 'panel',
  // Свой каталог кэша: с общим node_modules/.vite сайт и панель
  // перетирали предбандленные зависимости друг друга, и панель
  // падала с «504 Outdated Optimize Dep».
  cacheDir: 'node_modules/.vite-panel',
  // MapLibre разбирает векторные тайлы в веб-воркере. Предбандленная
  // Vite-версия воркера в dev не грузилась (ERR_FAILED), карта оставалась
  // пустой: стиль и метки есть, тайлов нет. Исключаем библиотеку
  // из оптимизации и просим собирать воркеры как ES-модули.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  base: '/panel/',
  plugins: [react()],
  // Отдельный порт: сайт занимает 5173, и оба dev-сервера должны
  // подниматься одновременно — панель тестируется рядом с сайтом.
  server: { port: 5174, strictPort: false },
  build: {
    outDir: '../dist/panel',
    emptyOutDir: true,
    sourcemap: false,
  },
})
