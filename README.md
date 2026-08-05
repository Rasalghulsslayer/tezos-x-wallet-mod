# Tezos X — Relayer & Wallets

Monorepo containing four packages that let Ethereum-compatible dApps run on **Tezos X** and give users native wallets for its two runtimes:

- **[`@tezosx/relayer`](packages/relayer)** — Cross-runtime SDK: an EIP-1193 provider (`window.ethereum`) for Tezos-native (tz1) signers that routes transactions through the Tezos X NAC cross-runtime gateway, plus NAC precompile encoders and builders for EVM-native (0x) consumers.
- **[`@tezosx/wallet-core`](packages/core)** — Shared wallet engine: keyring, vault crypto, use-cases, ports and adapters. Consumed as raw TypeScript by both wallet shells.
- **[`@tezosx/wallet`](packages/wallet)** — Standalone Chrome MV3 wallet that signs transactions locally with the built-in signer from `@tezosx/wallet-core` (no Temple required) and embeds the relayer for dApp connectivity.
- **[`@tezosx/wallet-mobile`](packages/mobile)** — Expo / React Native wallet app: WalletConnect pairing, biometric unlock, auto-lock, native crypto.

Full architecture, API reference and user flows are documented on the **[documentation site](https://trilitech.github.io/tezos-x-wallet/)**.

## Repository layout

```
packages/
├── relayer/       # @tezosx/relayer — cross-runtime SDK + legacy Temple-backed MV3 extension (superseded POC)
├── core/          # @tezosx/wallet-core — shared wallet engine (keyring, vault crypto, use-cases)
├── wallet/        # @tezosx/wallet — standalone Chrome MV3 wallet
└── mobile/        # @tezosx/wallet-mobile — Expo / React Native wallet app
website/           # Docusaurus site (two doc instances, versioned independently)
playground/        # Next.js demo dApp for manual testing
docs/              # Repo-level working documents (audits, plans)
```

## Quick start

```bash
npm install
```

### Build the relayer

```bash
npm run build         # IIFE bundle → packages/relayer/dist/
npm run build:ext     # Chrome MV3 extension → packages/relayer/extension/dist/
```

### Build the wallet

```bash
npm run wallet:build  # Chrome MV3 extension → packages/wallet/dist/
npm run wallet:dev    # Vite dev server with HMR (load packages/wallet/dist/ unpacked)
```

`@tezosx/wallet-core` is a raw-TypeScript workspace library — it has no build step and is compiled by whichever shell imports it.

### Run the mobile app

The mobile app is an Expo dev-build project (no Expo Go) — see [`packages/mobile`](packages/mobile):

```bash
npm run ios -w @tezosx/wallet-mobile      # or: npm run android -w @tezosx/wallet-mobile
```

### Run the docs locally

```bash
cd website && npm install && npm run start
```

## Loading either extension in Chrome

1. `chrome://extensions` → **Developer mode** ON
2. **Load unpacked** → select `packages/wallet/dist/` (the wallet) *or* `packages/relayer/extension/` (the relayer POC — its manifest sits at the folder root and references the built `dist/` bundles, so build with `npm run build:ext` first)

The wallet is self-contained — no Temple needed. The relayer extension is a **superseded proof of concept** kept for reference: it requires **Temple Wallet** installed and connected to Tezos X Previewnet, and `@tezosx/wallet` is the supported extension.

## Network — Tezos X Previewnet

| | Value |
|---|---|
| EVM RPC | `https://evm.previewnet.tezosx.nomadic-labs.com` |
| Michelson RPC | `https://michelson.previewnet.tezosx.nomadic-labs.com` |
| Chain ID | `0x1f440` (128064) |
| EVM explorer | [Blockscout](https://blockscout.previewnet.tezosx.nomadic-labs.com) |
| Michelson explorer | [tzkt](https://previewnet.tezosx.tzkt.io) |
| NAC gateway | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` |

## Releases

The four packages are versioned **independently**. See:
- [packages/relayer/CHANGELOG.md](packages/relayer/CHANGELOG.md)
- [packages/core/CHANGELOG.md](packages/core/CHANGELOG.md)
- [packages/wallet/CHANGELOG.md](packages/wallet/CHANGELOG.md)
- [packages/mobile/CHANGELOG.md](packages/mobile/CHANGELOG.md)
- [Root historical index](CHANGELOG.md) (frozen — per-package changelogs are canonical)

Tags follow the `<package>-vX.Y.Z` format: `relayer-v0.7.0`, `wallet-core-v0.4.0`, `wallet-v0.14.0`, `wallet-mobile-v0.2.0`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Lint, typechecks, the three unit-test suites and the blocking Playwright E2E gate run automatically on every PR via [GitHub Actions](.github/workflows/ci.yml); the documentation site is deployed to GitHub Pages on every push to `main`.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
