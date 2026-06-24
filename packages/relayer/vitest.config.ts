import { defineConfig } from 'vitest/config';

// Mirrors the wallet's Vitest setup: node environment, co-located *.test.ts,
// no globals. No `@` alias here — the relayer imports in relative `.js` form
// (NodeNext style) and Vite resolves those specifiers to their `.ts` sources.
export default defineConfig({
  test: {
    environment: 'node',
    include:     ['src/**/*.test.ts'],
    globals:     false,
    testTimeout: 30_000,
  },
});
