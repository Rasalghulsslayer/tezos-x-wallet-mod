# Injecting the Relayer via Tampermonkey

## Prerequisites

- [Tampermonkey](https://www.tampermonkey.net/) installed in Chrome
- Relayer built: `npm run build` → produces `dist/relayer.iife.js`

## Setup

### 1. Allow Tampermonkey on all sites

Go to `chrome://extensions` → Tampermonkey → **Details** → **Site access** → set to **On all sites**.

### 2. Build the inline userscript

Copy the full content of `dist/relayer.iife.js` and paste it directly into the userscript:

```js
// ==UserScript==
// @name         TezosX Relayer Injector
// @namespace    tezosx-relayer
// @version      0.3
// @description  Injects TezosX EIP-1193 relayer into Etherlink dApps
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  // ── Paste the full content of dist/relayer.iife.js here ──

  console.log('[TezosX] Relayer injected ✓');
})();
```

### 3. Save and reload the target page

The console should show `[TezosX] Relayer injected ✓` and `[TezosX Relayer] window.ethereum injected ✓`.

## Why inline instead of `GM_xmlhttpRequest`

The async approach (`GM_xmlhttpRequest`) loads the relayer after the page has already started — dApps using EIP-6963 dispatch `eip6963:requestProvider` early at page load, before the async script arrives.

```
Async (broken for EIP-6963):
  page loads → dApp requests EIP-6963 providers → [network delay] → relayer arrives too late ✗

Inline (correct):
  page loads → relayer already in script → EIP-6963 announced immediately → dApp receives provider ✓
```

Inlining the bundle eliminates the network round-trip and guarantees the provider is registered before any dApp code runs.

## Restricting to specific sites

Replace `@match *://*/*` with the target URL:

```
// @match        https://shadownet.faucet.etherlink.com/*
// @match        https://app.hanji.finance/*
```

## Updating the script

After each `npm run build`, re-copy the content of `dist/relayer.iife.js` into the userscript and save.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Script doesn't run, no console output | Check Tampermonkey badge shows `1` on the page |
| Provider not detected by dApp | Make sure the bundle is inlined, not loaded async |
| Page CSP blocks the script | Use a Chrome extension instead (MV3) |
| MetaMask is picked instead of the relayer | Disable MetaMask on the site via its extension menu |
