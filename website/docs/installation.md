---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

:::tip TezosX Wallet
This page covers the **Relayer** extension (requires Temple Wallet). If you want a standalone wallet with no external dependencies, see [Wallet — Installation](/wallet/installation).
:::


## Prerequisites

- Node.js 20+
- npm 10+
- [Temple Wallet](https://templewallet.com) — the **Temple mobile app**. The Beacon pairing was last verified against Temple mobile (QR-code scan); pairing with the Temple browser extension did not work at the time of writing. See [Connect Wallet](./user-flows/connect-wallet) for details.
- Tezos X Previewnet configured in Temple (RPC URL: `https://michelson.previewnet.tezosx.nomadic-labs.com`)

---

## Method 1 — Chrome Extension (recommended)

The Chrome/Brave/Firefox MV3 extension is the easiest way to use the relayer. It automatically injects `window.ethereum` on every page — no manual setup required.

### Build the extension

```bash
git clone https://github.com/trilitech/tezos-x-wallet.git
cd tezos-x-wallet
npm install
npm run build:ext    # → packages/relayer/extension/dist/
```

### Load in Chrome or Brave

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `packages/relayer/extension/` folder — it contains `manifest.json`, which references the built scripts in its `dist/` subfolder

> **Brave only:** go to `brave://settings/web3` → Default wallet → select **None** or **Extensions** to avoid conflict with Brave Wallet.

### Load in Firefox

Firefox supports MV3 since Firefox 109.

1. Go to `about:debugging` → *This Firefox*
2. Click *Load Temporary Add-on*
3. Select `packages/relayer/extension/manifest.json`

### Development mode (auto-reload)

```bash
npm run dev:ext   # launches Chromium with the extension pre-loaded
```

---

## Method 2 — Script tag (own dApp)

If you control the page, add the IIFE bundle before any other scripts:

```bash
npm run build    # → packages/relayer/dist/relayer.iife.js
```

```html
<script src="/dist/relayer.iife.js"></script>
```

---

## Method 3 — Tampermonkey userscript (testing only)

For quick testing on third-party sites without installing the extension.

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Build the relayer: `npm run build`
3. Create a new Tampermonkey script and paste the content of `dist/relayer.iife.js` inline (see [Injection Methods](./technical/injection) for the full template)

:::warning
Do **not** load the bundle via `GM_xmlhttpRequest` — inline it. Async loading breaks EIP-6963 timing.
:::

---

## Playground

Run the Next.js playground to test the relayer locally:

```bash
cd playground
npm install
npm run dev
# → http://localhost:3000
```

The playground lets you connect Temple, check your balance, send transfers, and interact with the Counter contract.
