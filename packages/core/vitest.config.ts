import { defineConfig } from 'vitest/config';

// Mirrors the wallet's Vitest setup: node environment, co-located *.test.ts,
// no globals. Core uses relative imports internally and consumes @tezosx/relayer
// via its exports map, so no path alias is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include:     ['src/**/*.test.ts'],
    globals:     false,
    testTimeout: 30_000,
  },
});
