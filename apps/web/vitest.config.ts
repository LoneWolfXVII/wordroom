import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Unit tests for the app's pure logic — code normalisation, name format checks,
 * API error mapping.
 *
 * Deliberately node-environment and component-free: anything that needs a DOM
 * needs jsdom and a testing library, and the flows those would cover are
 * workstream 6's Playwright suite, running against a real Supabase. What is
 * tested here is the logic that has to be right before a request is made.
 *
 * The `@/` alias mirrors tsconfig's `paths`, which Vite does not read.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{app,components,features,lib}/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
