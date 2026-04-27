import { defineConfig } from 'vitest/config'

/**
 * Vitest config for wishcode (D-1 / A-0 / A-1 tests).
 *
 * Tests live under:
 *   - `electron/shared/**\/__tests__/**\/*.test.ts`  (IPC schemas, AI canonical)
 *   - `electron/native/**\/__tests__/**\/*.test.ts`  (provider runtime, etc.)
 *   - `src/**\/__tests__/**\/*.test.{ts,tsx}`         (shell, when added in S-0.1)
 *
 * Renderer tests use `jsdom`; main-process tests run in node.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'electron/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', 'dist', 'dist-electron', 'release'],
  },
})
