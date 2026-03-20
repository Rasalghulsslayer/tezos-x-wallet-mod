# Injecting the Relayer via Tampermonkey

## Prerequisites

- [Tampermonkey](https://www.tampermonkey.net/) installed in Chrome
- Relayer dev server running on port 8080: `npx serve . -p 8080 --cors`

## Setup

### 1. Allow Tampermonkey on all sites

Go to `chrome://extensions` → Tampermonkey → **Details** → **Site access** → set to **On all sites**.

### 2. Create a new userscript

Click the Tampermonkey icon → **Create a new script**, then paste:

```js
// ==UserScript==
// @name         TezosX Relayer Injector
// @namespace    tezosx-relayer
// @version      0.2
// @description  Injects TezosX EIP-1193 relayer into Etherlink dApps
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  GM_xmlhttpRequest({
    method: 'GET',
    url: 'http://localhost:8080/dist/relayer.iife.js',
    onload: function (response) {
      const script = document.createElement('script');
      script.textContent = response.responseText;
      document.documentElement.appendChild(script);
      console.log('[TezosX] Relayer injected ✓');
    },
    onerror: function () {
      console.error('[TezosX] Failed to load relayer — is the server running on :8080?');
    },
  });
})();
```

### 3. Save and reload the target page

The console should show `[TezosX] Relayer injected ✓` and `[TezosX Relayer] window.ethereum injected ✓`.

## Why `GM_xmlhttpRequest` instead of `script.src`

HTTPS pages block HTTP script sources (mixed content). `GM_xmlhttpRequest` runs in the extension context, bypassing this restriction, then injects the script content inline.

## Restricting to specific sites

Replace `@match *://*/*` with the target URL:

```
// @match        https://shadownet.faucet.etherlink.com/*
// @match        https://app.hanji.finance/*
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Script doesn't run, no console output | Check Tampermonkey badge shows `1` on the page |
| `Failed to load relayer` | Start the dev server: `npx serve . -p 8080 --cors` |
| Page CSP blocks the script | Use a Chrome extension instead (MV3) |
| MetaMask is picked instead of the relayer | Disable MetaMask on the site via its extension menu |
