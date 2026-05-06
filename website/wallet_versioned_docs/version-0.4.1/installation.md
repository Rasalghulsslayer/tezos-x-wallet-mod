---
id: installation
title: Installation
sidebar_label: Installation
---

# Installation

TezosX Wallet is a Manifest V3 Chrome extension built with Vite. It is not yet published to the Chrome Web Store, so you install it in **developer mode** from the compiled source.

## Prerequisites

- Node.js ≥ 20
- pnpm (the monorepo uses pnpm workspaces)
- Google Chrome or Chromium

## Build the extension

From the **monorepo root**:

```bash
# Install all workspace dependencies
pnpm install

# Development build with HMR (Vite dev server at localhost:5173)
pnpm wallet:dev

# Production build (output in packages/wallet/dist/)
pnpm wallet:build
```

The compiled extension lands at `packages/wallet/dist/`.

:::tip Development mode
`pnpm wallet:dev` keeps Vite running and hot-reloads the popup and UI pages. Content scripts and the service worker require a manual extension reload in `chrome://extensions` after each change.
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
2. Choose **Create a new wallet** or **Import an existing seed**
3. Follow the [Create](./user-flows/create-wallet) or [Import](./user-flows/import-wallet) flow
4. After setup, the Home screen shows your XTZ and USDC balances

## Updating after a code change

After `pnpm wallet:build`, go to `chrome://extensions` and click the **↺ Reload** button next to TezosX Wallet. The popup will reflect the new build immediately.
