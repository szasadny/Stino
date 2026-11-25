import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { API_BASE } from './src/lib/constants'

// Proxy API calls in dev so the browser sees the same origin as production.
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      [API_BASE]: 'http://localhost:8080',
    },
  },
})
