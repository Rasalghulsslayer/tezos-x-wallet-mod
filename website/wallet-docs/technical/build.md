---
id: build
title: Build System
sidebar_label: Build System
---

# Build System

TezosX Wallet is built with **Vite 8** and the **`@crxjs/vite-plugin`** package (2.x), which handles Chrome extension specific concerns: content script injection, manifest transformation, and multiple entry points. A small postbuild script then sanitizes the generated manifest (see [The postbuild manifest step](#the-postbuild-manifest-step)).

## Entry points

The build produces five independently loaded contexts:

| Entry | Source | Loaded by |
|---|---|---|
| `popup.html` | `src/ui/popup-main.tsx` | Extension toolbar icon click, or the Chrome side panel (`popup.html?mode=side`) |
| `approve.html` | `src/ui/approve-main.tsx` | Approval window opened by the service worker via `chrome.windows.create` |
| Service worker | `src/background/service-worker.ts` | Chrome, MV3 background |
| Content script (ISOLATED) | `src/content/bridge.ts` | Chrome, injected on all pages |
| Content script (MAIN) | `src/injected/provider.ts` | Chrome, injected on all pages |

Both HTML documents must be listed in `build.rollupOptions.input` — the service worker and content scripts are picked up from the manifest by CRXJS.

## Vite config highlights

**File**: [`packages/wallet/vite.config.ts`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/vite.config.ts)

```ts
export default defineConfig({
  base: '',   // relative asset paths — required for Chrome extensions

  define: {
    global: 'globalThis',   // Taquito's browser bundles expect Node's `global`
    // Version strings shown in Settings → About, sourced from the workspace
    // package.json files at build time so they can never go stale.
    __WALLET_VERSION__: JSON.stringify(pkg.version),
    __CORE_VERSION__:   JSON.stringify(corePkg.version),
  },

  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),   // CRXJS handles MV3 service worker + content scripts
  ],

  resolve: {
    alias: {
      '@':    path.resolve(__dirname, './src'),
      buffer: 'buffer/',
    },
  },

  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',   // also applied during dep pre-bundling
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
```

### Why `global: 'globalThis'` in two places

Taquito's browser bundles probe Node's `global` (for example `@taquito/utils` ships an inlined Buffer shim that starts with `typeof global !== "undefined" ? global : …`), and `global` does not exist in a service worker or page context. Vite's top-level `define` rewrites source files; `optimizeDeps.esbuildOptions.define` applies the same rewrite to the esbuild pre-bundling step that processes `node_modules`. Both are needed, or the pre-bundled Taquito code crashes at import time in the service worker.

The polyfill exists for Taquito alone. The Beacon SDK is a dependency of `@tezosx/relayer`'s Temple/Beacon integration, a module the wallet never imports — it is not part of the wallet bundle.

### Buffer

Taquito's signer also reads `Buffer` off the global scope. The `buffer: 'buffer/'` alias resolves the polyfill package, and the shared `buffer-shim` module (imported first by the service worker entry) installs it on `globalThis` once per entry point.

## Commands

From the **monorepo root** (npm workspaces):

```bash
# Development server (HMR for popup/approve, no HMR for content scripts)
npm run wallet:dev

# Production build
npm run wallet:build

# Type checking
npm run wallet:typecheck
```

From inside `packages/wallet/`:

```bash
npm run dev          # vite dev server
npm run build        # tsc -b && vite build && node scripts/postbuild-manifest.mjs
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit suite
npm run test:e2e     # Playwright E2E suite (builds first, then runs against dist/)
```

## The postbuild manifest step

`npm run build` ends with `scripts/postbuild-manifest.mjs`, which sanitizes `dist/manifest.json`: it strips every HTML page and wildcard entry that `@crxjs/vite-plugin` injects into `web_accessible_resources`, and removes the key entirely when nothing remains.

This is a security requirement, not cosmetics. `approve.html` must never be web-accessible: a page that can address the approval document by URL can embed or overlay it, opening the door to clickjacking of the approval UI. The service worker opens the approval window itself via `chrome.windows.create`, which does not require the resource to be web-accessible. The E2E suite's global setup fails the entire run if an HTML page ever leaks back into `web_accessible_resources`.

After any change to the build pipeline, verify `dist/manifest.json`:

- `version` matches `package.json`
- no HTML page under `web_accessible_resources` (ideally the key is absent)
- `content_security_policy.extension_pages` contains `frame-ancestors 'none'`

## Output structure

Key artifacts in `packages/wallet/dist/` after `npm run wallet:build` (abridged):

```
dist/
├── manifest.json              # transformed by CRXJS, sanitized by the postbuild script
├── popup.html
├── approve.html
├── service-worker-loader.js   # CRXJS loader shim for the MV3 service worker
├── icons/
├── src/                       # compiled content scripts + their loader shims
└── assets/                    # chunked popup / approve bundles
```

Load `dist/` as an unpacked extension in `chrome://extensions`.

## Content script worlds

The manifest declares two content script entries:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["src/content/bridge.ts"],
    "world": "ISOLATED",
    "run_at": "document_start"
  },
  {
    "matches": ["<all_urls>"],
    "js": ["src/injected/provider.ts"],
    "world": "MAIN",
    "run_at": "document_start"
  }
]
```

CRXJS compiles each entry and rewrites the manifest to point at generated loader shims (`bridge.ts-loader.js`, `provider.ts-loader.js`) that import the compiled modules.
