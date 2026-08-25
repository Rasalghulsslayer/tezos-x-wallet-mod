import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };
import corePkg from '../core/package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Drop octez.connect's 116 kB bundled wallet REGISTRY from the build.
 *
 * A `resolve.alias` cannot express this: the SDK imports the file relatively
 * (`./data/bundled-wallet-registry` from `blockchain.js`), so there is no package
 * specifier to alias, and matching the bare relative path would risk catching
 * an unrelated module. Matching on the importer is precise.
 *
 * See src/shared/beacon/wallet-registry-stub.ts for why this data file is
 * droppable while the blockchain module around it is not.
 */
function stubBeaconWalletRegistry() {
  const stub = path.resolve(__dirname, './src/shared/beacon/wallet-registry-stub.ts');
  return {
    name: 'tezosx:stub-beacon-wallet-registry',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (
        importer != null &&
        importer.includes('octez.connect-blockchain-tezos') &&
        source.includes('data/bundled-wallet-registry')
      ) {
        return stub;
      }
      return null;
    },
  };
}

export default defineConfig({
  base: '',   // relative asset paths — required for Chrome extensions
  define: {
    global: 'globalThis',   // Taquito + Beacon SDK expect Node global
    // Version strings surfaced in the Settings "About" row, sourced from the
    // workspace package.json files at build time so they can never go stale.
    __WALLET_VERSION__: JSON.stringify(pkg.version),
    __CORE_VERSION__:   JSON.stringify(corePkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
    stubBeaconWalletRegistry(),
  ],
  resolve: {
    alias: {
      '@':    path.resolve(__dirname, './src'),
      buffer: 'buffer/',
      // The Matrix P2P transport is unreachable in this wallet but unshakeable,
      // because octez.connect-wallet's barrel star-re-exports it and no
      // octez.connect package declares `sideEffects: false`. See
      // src/shared/beacon/matrix-transport-stub.ts for why the stub throws
      // rather than being empty.
      '@tezos-x/octez.connect-transport-matrix': path.resolve(
        __dirname, './src/shared/beacon/matrix-transport-stub.ts',
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',  // same as top-level define but applied to pre-bundled deps
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:   path.resolve(__dirname, 'popup.html'),
        approve: path.resolve(__dirname, 'approve.html'),
      },
    },
  },
});
