---
id: build
title: Build
sidebar_position: 2
---

# Build System

The relayer uses [esbuild](https://esbuild.github.io/) for fast bundling. There are two independent build targets: the IIFE bundle (for script-tag injection) and the MV3 extension.

All commands below work from the repository root (the monorepo forwards them to the `@tezosx/relayer` workspace) as well as from `packages/relayer/`.

---

## IIFE bundle (script tag / Tampermonkey)

```bash
npm run build
```

**Output:**

```
packages/relayer/dist/
├── relayer.iife.js      ← injectable bundle
└── relayer.iife.js.map  ← source map
```

### Config highlights

```js
// build.mjs
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',       // Self-executing — no module system required
  platform: 'browser',
  target: ['es2020'],
  outfile: 'dist/relayer.iife.js',
  sourcemap: true,
  alias: {
    events: 'eventemitter3',
    crypto: './src/polyfills/crypto.js',
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"production"',
  },
});
```

---

## MV3 Extension

```bash
npm run build:ext
```

**Output:**

```
packages/relayer/extension/dist/
├── injected.js    ← window.ethereum (world: MAIN)
├── content.js     ← session bridge (world: ISOLATED)
├── background.js  ← service worker
└── popup.js       ← popup UI
```

The service worker (`background.js`) is bundled as an ES module (`format: 'esm'`) since MV3 supports native ES modules in service workers; the two content scripts and the popup are bundled as IIFEs because content scripts cannot be ES modules.

The extension is loaded unpacked from `packages/relayer/extension/` — the folder holding `manifest.json`, which references the built scripts under `dist/`. See [Installation](../installation#load-in-chrome-or-brave).

### Development mode (auto-reload)

```bash
npm run dev:ext    # launches Chromium with the extension pre-loaded via web-ext
```

### Type-checking

From `packages/relayer/`:

```bash
npm run typecheck      # checks src/
npm run typecheck:ext  # checks extension/src/
```

From the repository root, `npm run typecheck` runs both.
