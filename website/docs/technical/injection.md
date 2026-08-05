---
id: injection
title: Injection Methods
sidebar_position: 3
---

# Injection Methods

The relayer can be injected into any web page using three methods. The Chrome/Brave/Firefox MV3 extension is the recommended approach since v0.2.0.

| Method | CSP bypass | EIP-6963 timing | Recommended |
|---|---|---|---|
| **Chrome Extension** | ✅ | ✅ Synchronous (`document_start`) | ✅ v0.2.0+ |
| Script tag | ❌ | ✅ Synchronous | ✅ (own dApp only) |
| Tampermonkey (inline) | ❌ | ✅ Synchronous | 🧪 Testing only |

---

## 1. Chrome Extension (recommended)

Since v0.2.0, the relayer ships as a Manifest V3 extension. It injects `window.ethereum` at `document_start` via the `world: "MAIN"` content script mechanism — synchronously, before any page script runs.

### Architecture

```
extension/
├── manifest.json          MV3 manifest
├── popup.html             Connected sites UI
└── src/
    ├── injected.ts        window.ethereum + EIP-6963  (world: MAIN)
    ├── content.ts         Session bridge page → background  (world: ISOLATED)
    ├── background.ts      Service worker — session storage
    ├── popup.tsx          Popup UI (React)
    └── messages.ts        Shared message types
```

### Communication flow

```
Page (window.ethereum)
  │  postMessage  TEZOSX_SESSION_UPDATE
  ▼
content.ts  (ISOLATED world — trusted origin)
  │  chrome.runtime.sendMessage
  ▼
background.ts  (service worker — chrome.storage.local)
  │  chrome.tabs.sendMessage  PAGE_DISCONNECT
  ▼
content.ts → window.postMessage TEZOSX_DISCONNECT
  │
  ▼
injected.ts → wallet_revokePermissions
```

### Security notes

- The content script always uses `window.location.origin` (browser-provided) as the session key — it never trusts the `origin` field from the page's `postMessage` payload (spoofing prevention).
- "Disconnect" in the popup propagates all the way to the page and calls `wallet_revokePermissions` on the provider.

### Build & install

See [Installation](../installation) for step-by-step instructions.

---

## 2. Script tag (own dApp)

If you control the page, add the bundle before any other scripts:

```html
<script src="/dist/relayer.iife.js"></script>
```

Build with:

```bash
npm run build   # → dist/relayer.iife.js
```

---

## 3. Tampermonkey userscript

Install [Tampermonkey](https://www.tampermonkey.net/), then create a new script with the relayer bundle **inlined directly**:

```js
// ==UserScript==
// @name         TezosX Relayer Injector
// @namespace    tezosx-relayer
// @version      0.2.0
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
Loading the bundle asynchronously causes the relayer to arrive **after** dApps have already dispatched `eip6963:requestProvider`. The provider is never registered and the wallet doesn't appear in the connect modal.
:::

### Why timing matters

```
Async (broken for EIP-6963):
  page loads → dApp requests EIP-6963 providers → [network delay] → relayer arrives too late ✗

Inline (correct):
  page loads → relayer already in script → EIP-6963 announced → dApp receives provider ✓
```
