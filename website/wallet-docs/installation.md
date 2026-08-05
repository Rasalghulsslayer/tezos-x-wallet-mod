---
id: installation
title: Installation
sidebar_label: Installation
---

# Installation

TezosX Wallet is a Manifest V3 Chrome extension built with Vite. It is not yet published to the Chrome Web Store, so you install it in **developer mode** from the compiled source.

:::info Looking for the mobile app?
The wallet also ships as a mobile app that pairs with dApps over WalletConnect. See the [mobile quickstart](./mobile/quickstart).
:::

## Prerequisites

- Node.js ≥ 20
- npm (the monorepo uses npm workspaces)
- Google Chrome or Chromium

## Build the extension

From the **monorepo root**:

```bash
# Install all workspace dependencies
npm install

# Development build with HMR (Vite dev server at localhost:5173)
npm run wallet:dev

# Production build (output in packages/wallet/dist/)
npm run wallet:build
```

The compiled extension lands at `packages/wallet/dist/`.

:::tip Development mode
`npm run wallet:dev` keeps Vite running and hot-reloads the popup and UI pages. Content scripts and the service worker require a manual extension reload in `chrome://extensions` after each change.
:::

## Load the unpacked extension in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `packages/wallet/dist/`
5. The **TezosX Wallet** icon appears in your toolbar

## First-run onboarding

On the first click of the toolbar icon:

1. The popup opens on the **Welcome** screen
2. Pick the account kind — **Michelson runtime** (`tz1…`, signs Michelson operations) or **EVM runtime** (`0x…`, signs EIP-1559 transactions)
3. Choose **Create a new wallet**, or import an existing one (**I have a recovery phrase** for a Michelson account, **I have a private key** for an EVM account)
4. Follow the [Create](./user-flows/create-wallet) or [Import](./user-flows/import-wallet) flow
5. After setup, the Home screen shows your XTZ balance plus every registered ERC-20 token (USDC is seeded by default)

## Updating after a code change

After `npm run wallet:build`, go to `chrome://extensions` and click the **↺ Reload** button next to TezosX Wallet. The popup will reflect the new build immediately.
