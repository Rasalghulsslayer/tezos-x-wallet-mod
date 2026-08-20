---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

:::tip Tezos X Wallet
This page covers getting the **relayer SDK** into a project. If you are an end user looking for a wallet, see [Wallet — Installation](/wallet/installation).
:::

## Getting the SDK — the honest part

`@tezosx/relayer` 0.8.0 is marked `"private": true` and is **not published to npm**. `npm install @tezosx/relayer` cannot work today. Additionally, the package's `exports` map points at raw TypeScript sources (`.ts` files), so any consumer needs a TypeScript-aware toolchain (Vite, Next.js, Metro, tsx, …) — there is no prebuilt JavaScript library entry.

Three paths are practicable today, depending on what you are building.

### Path A — you are building a dApp page: no install at all

If your goal is letting wallet users sign on your dApp, you never import this package. Your page talks to an **injected EIP-1193 provider**:

- The [Tezos X Wallet](/wallet/intro) extension injects `window.ethereum` and announces itself via EIP-6963. This is the supported surface.
- The legacy IIFE bundle (`packages/relayer/dist/relayer.iife.js`, built by `npm run build`) injects a Temple-backed provider into a page via a `<script>` tag — useful for testing without any wallet extension. See the [legacy section](#legacy-the-temple-backed-extension-poc-superseded) below.

Head straight to the [Quickstart](./quickstart).

### Path B — work inside the monorepo (npm workspaces)

The way the SDK is actually consumed today: as a workspace dependency. `@tezosx/wallet-core` declares it like this in its `package.json`:

```json
"dependencies": {
  "@tezosx/relayer": "^0.9.0"
}
```

npm workspaces resolves that range to the local `packages/relayer` folder. To do the same:

```bash
git clone https://github.com/trilitech/tezos-x-wallet.git
cd tezos-x-wallet
npm install
```

then add your own package under `packages/` (register it in the root `package.json` `workspaces` array) and declare the dependency as above.

### Path C — vendor the package folder

Copy `packages/relayer/` into your own repo and wire it up as a local package (a `file:` dependency or your monorepo tool's equivalent). Because the exports are source-only, your bundler must compile TypeScript from `node_modules`-style local packages. You will need the runtime dependencies the sources import:

- `viem` — ABI encoding and keccak (always)
- `eventemitter3` — the provider's event emitter (`/tezos` side)
- `@airgap/beacon-sdk` — only if you use the bundled `BeaconClient`
- `@taquito/rpc` — Micheline types (type-only imports)

Keep an eye on the [CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/relayer/CHANGELOG.md) when vendoring — you own the update cadence.

## Network facts

Everything below is Tezos X **Previewnet**. Kernel-level values live in `packages/relayer/src/shared/constants.ts` (exported as `@tezosx/relayer/constants`); explorer URLs and the chain-id mirror are product-level constants owned by `@tezosx/wallet-core` (`packages/core/src/shared/constants.ts`).

| Fact | Value | Where it lives |
|---|---|---|
| EVM runtime RPC | `https://evm.previewnet.tezosx.nomadic-labs.com` | `TEZLINK_EVM_RPC` (relayer) |
| Michelson runtime RPC | `https://michelson.previewnet.tezosx.nomadic-labs.com` | `TEZOS_L1_RPC` (relayer) |
| Chain id | `128064` (`0x1f440`) | Not a relayer constant — fetched at runtime via `eth_chainId`; mirrored as `PREVIEWNET_CHAIN_ID` in wallet-core |
| NAC gateway (Michelson side) | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` | `NAC_CONTRACT` (relayer) |
| NAC precompile (EVM side) | `0xff00000000000000000000000000000000000007` | `NAC_PRECOMPILE_ADDR` (relayer) |
| EVM explorer (Blockscout) | `https://blockscout.previewnet.tezosx.nomadic-labs.com` | `EVM_EXPLORER` (wallet-core) |
| Michelson explorer (TzKT) | `https://previewnet.tezosx.tzkt.io` | `TEZOS_EXPLORER` (wallet-core) |
| Read-call deadline | 15 s (`RPC_TIMEOUT_MS`) | relayer, since 0.8.0 — see [Surprising behaviors](./gotchas#fees-and-gas) |

## Prerequisites

- Node.js 22 (the version CI pins) and the npm that ships with it
- For the Beacon path only: [Temple Wallet](https://templewallet.com) — the **Temple mobile app**. The Beacon pairing was last verified against Temple mobile (QR-code scan); pairing with the Temple browser extension did not work at the time of writing. See [Connect Wallet](./user-flows/connect-wallet) for details.
- For the Beacon path only: Tezos X Previewnet configured in Temple (RPC URL: `https://michelson.previewnet.tezosx.nomadic-labs.com`)

## Playground

The Next.js playground under `playground/` is the reference dApp integration. Deliberately, it does **not** import the SDK — it is a pure injected-provider consumer, which is exactly the position a third-party dApp is in.

```bash
cd playground
npm install
npm run dev
# → http://localhost:3000
```

The playground lets you connect a wallet, check your balance, send transfers, and interact with the Counter contract.

---

## Legacy: the Temple-backed extension PoC (superseded)

The MV3 browser extension under `packages/relayer/extension/` was the original proof of concept: it injects the Temple-backed `RelayerProvider` into every page. It has been **superseded by [`@tezosx/wallet`](/wallet/installation)**, the supported extension. The PoC is kept in-tree for reference and for provider-injection testing; expect no feature work on it.

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

### Script tag / Tampermonkey

If you control the page, the IIFE bundle can be added directly:

```bash
npm run build    # → packages/relayer/dist/relayer.iife.js
```

```html
<script src="/dist/relayer.iife.js"></script>
```

For quick testing on third-party sites, paste the bundle content inline into a Tampermonkey userscript. Do **not** load the bundle via `GM_xmlhttpRequest` — inline it; async loading breaks EIP-6963 timing.

Note that the IIFE constructs its provider without a pending-ops store, so synthetic-to-real hash resolution state does not survive a page reload — fine for testing, not for a product. See [the PendingOpsStore contract](./sdk/provider#the-pendingopsstore-contract) for the persistent form.
