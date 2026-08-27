import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api/* to the Django backend so the browser sees a single
// origin (no CORS setup needed). In production the SPA is built and served
// behind the same reverse proxy as the API.
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
