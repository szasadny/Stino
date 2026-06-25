import { defineConfig } from 'vitest/config'

// Unit tests for the pure `lib/*.ts` helpers (no DOM needed — the node
// environment is enough). Component testing would add jsdom + a Svelte testing
// library; it's deliberately out of scope here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
