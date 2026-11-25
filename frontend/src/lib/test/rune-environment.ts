import { builtinEnvironments, type Environment } from 'vitest/runtime'

// Node globals, but `*.svelte.ts` compiles for the client so `$effect` and friends actually run.
export default {
  ...builtinEnvironments.node,
  name: 'rune-node',
  viteEnvironment: 'client',
} satisfies Environment
