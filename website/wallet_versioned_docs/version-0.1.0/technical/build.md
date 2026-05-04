---
id: build
title: Build System
sidebar_label: Build System
---

# Build System

TezosX Wallet is built with **Vite 8** and the **`@crxjs/vite-plugin`** package, which handles Chrome extension specific concerns: content script injection, manifest transformation, and multiple entry points.

## Entry points

The build produces four independent bundles:

| Entry | Output | Loaded by |
|---|---|---|
| `src/ui/popup.tsx` | `popup.html` | Extension toolbar icon click |
| `src/ui/approve.tsx` | `approve.html` | `ApprovalQueue.enqueue()` popup window |
| `src/content/bridge.ts` | content script (ISOLATED) | Chrome, injected on all pages |
| `src/injected/provider.ts` | content script (MAIN) | Chrome, injected on all pages |

## Vite config highlights

**File**: [`packages/wallet/vite.config.ts`](../../../packages/wallet/vite.config.ts)

```ts
export default defineConfig({
  base: '',   // relative paths — required for Chrome extensions

  define: {
    global: 'globalThis',   // Taquito / Beacon SDK expect Node's `global`
  },

  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',   // also applied during dep pre-bundling
      },
    },
  },

  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),   // CRXJS handles MV3 service worker + content scripts
  ],
});
```

### Why `global: 'globalThis'` in two places

Vite's top-level `define` applies to source files. `optimizeDeps.esbuildOptions.define` applies to the esbuild pre-bundling step that processes `node_modules`. Both are needed because `@taquito/local-forging` contains an IIFE that checks `typeof global !== "undefined"` — without the second define, `scope` is `undefined` in the service worker context, crashing with `TypeError: Cannot read properties of undefined (reading 'TextEncoder')`.

## Commands

From the **monorepo root**:

```bash
# Development server (HMR for popup/approve, no HMR for content scripts)
pnpm wallet:dev

# Production build
pnpm wallet:build

# Type checking
pnpm wallet:typecheck
```

From inside `packages/wallet/`:

```bash
vite               # dev
vite build         # production
tsc --noEmit       # type check
```

## Output structure

After `pnpm wallet:build`, `packages/wallet/dist/` contains:

```
dist/
├── manifest.json          # transformed by CRXJS
├── popup.html
├── approve.html
├── icons/
├── src/
│   ├── background/service-worker.js
│   ├── content/bridge.js
│   └── injected/provider.js
└── assets/
    └── *.js / *.css       # chunked popup + approve bundles
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

CRXJS compiles each with appropriate module settings. The MAIN world script uses a loader shim (`provider.ts-loader.js`) because Chrome cannot load ES modules directly in the MAIN world in dev mode.
