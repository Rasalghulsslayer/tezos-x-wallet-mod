---
id: injection
title: Injection Methods
sidebar_position: 3
---

# Injection Methods

The relayer can be injected into any web page using three methods.

## 1. Script tag (own dApp)

If you control the page, add the script tag before any other scripts:

```html
<script src="/dist/relayer.iife.js"></script>
```

## 2. Tampermonkey userscript

Install [Tampermonkey](https://www.tampermonkey.net/), then create a new script with the relayer bundle **inlined directly**:

```js
// ==UserScript==
// @name         TezosX Relayer Injector
// @namespace    tezosx-relayer
// @version      0.3
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  // ── Paste the full content of dist/relayer.iife.js here ──

  console.log('[TezosX] Relayer injected ✓');
})();
```

:::warning Inline only — do not use `GM_xmlhttpRequest`
Loading the bundle asynchronously via `GM_xmlhttpRequest` causes the relayer to arrive **after** dApps have already dispatched `eip6963:requestProvider`. The provider is never registered and the wallet doesn't appear in the connect modal.

Inlining the bundle guarantees the provider is registered synchronously at `document-start`, before any dApp code runs.
:::

### Why timing matters

```
Async (broken for EIP-6963):
  page loads → dApp requests EIP-6963 providers → [network delay] → relayer arrives too late ✗

Inline (correct):
  page loads → relayer already in script → EIP-6963 announced → dApp receives provider ✓
```

### Setup

1. Install Tampermonkey from the Chrome Web Store
2. Go to `chrome://extensions` → Tampermonkey → **Details** → **Site access** → **On all sites**
3. Build the relayer: `npm run build`
4. Create a new script, paste the template above, and replace the comment with the full content of `dist/relayer.iife.js`
5. Reload the target page — check the console for `[TezosX] Relayer injected ✓`

After each rebuild, re-copy `dist/relayer.iife.js` into the userscript and save.

## 3. Chrome Extension (roadmap)

A proper MV3 extension will be the production delivery method. Extensions can inject into any page using `chrome.scripting.executeScript({ world: 'MAIN' })`, which bypasses Content Security Policy restrictions — something userscripts cannot do.

| Method | CSP bypass | EIP-6963 timing | Production-ready |
|---|---|---|---|
| Script tag | ❌ | ✅ Synchronous | ✅ (own dApp) |
| Tampermonkey (inline) | ❌ | ✅ Synchronous | 🧪 Testing only |
| Chrome Extension | ✅ | ✅ Synchronous | ✅ Roadmap |
