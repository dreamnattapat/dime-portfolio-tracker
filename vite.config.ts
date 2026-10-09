import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Same forwarding as the price proxy Worker (worker/index.ts) does in production.
      '/api/chart/': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chart\//, '/v8/finance/chart/'),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
  build: {
    rolldownOptions: {
      // The app, plus the static privacy policy page (served at /privacy).
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        privacy: path.resolve(import.meta.dirname, 'privacy.html'),
      },
    },
  },
})
