import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: './src/lib/test/rune-environment.ts',
  },
})
