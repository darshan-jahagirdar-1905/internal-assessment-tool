import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local API (npm run dev:api at the repo root). changeOrigin stays off so
    // the API's same-origin check sees the browser's host.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
