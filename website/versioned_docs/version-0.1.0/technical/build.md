---
id: build
title: Build
sidebar_position: 2
---

# Build System

The relayer uses [esbuild](https://esbuild.github.io/) for fast bundling into a single IIFE file.

## Command

```bash
node build.mjs
```

## Output

```
dist/
├── relayer.iife.js      ← injectable bundle
└── relayer.iife.js.map  ← source map
```

## Config highlights

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

The `iife` format wraps everything in a self-executing function, making it safe to inject into any page without polluting the global namespace (except for `window.ethereum`).
