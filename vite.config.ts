import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Адрес без завершающего слэша — обычная человеческая привычка.
 *  Vite сам такой редирект не делает, и /panel отдавал 404 сайта. */
const panelSlash = {
  name: 'panel-trailing-slash',
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/panel') { res.statusCode = 302; res.setHeader('Location', '/panel/'); res.end(); return }
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), panelSlash],
  // Панель — отдельная сборка на своём порту, но в браузере она должна
  // жить там же, где сайт: и локально, и в бою это /panel/.
  // Поэтому dev-сервер сайта переправляет /panel/* на dev-сервер панели.
  // Нужен запущенный `npm run dev:panel` — проще всего `npm run dev:all`.
  server: {
    proxy: {
      '/panel': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,          // одна CSS на сайт — меньше запросов, лучше кэш
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        // Стабильные имена чанков: контент-хэш только на изменившихся файлах
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  ssgOptions: {
    script: 'async',
    formatting: 'minify',
    crittersOptions: false,
  },
})
