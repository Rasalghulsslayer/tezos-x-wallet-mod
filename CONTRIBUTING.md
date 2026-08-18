# Contributing to Tezos X — Relayer & Wallets

This monorepo ships **four independently versioned packages**:

- **`@tezosx/relayer`** ([packages/relayer/](packages/relayer/)) — Cross-runtime SDK: EIP-1193 provider for Tezos-native (tz1) signers routing EVM dApp calls through the NAC gateway, plus NAC precompile encoders/builders for EVM-native (0x) consumers.
- **`@tezosx/wallet-core`** ([packages/core/](packages/core/)) — Shared wallet engine: keyring, vault crypto, use-cases, ports and adapters. Consumed as raw TypeScript by both wallet shells.
- **`@tezosx/wallet`** ([packages/wallet/](packages/wallet/)) — Standalone Chrome MV3 wallet that signs locally and embeds the relayer.
- **`@tezosx/wallet-mobile`** ([packages/mobile/](packages/mobile/)) — Expo / React Native wallet app (WalletConnect, biometric unlock, auto-lock).

Plus the documentation site ([website/](website/), Docusaurus, two doc instances) and a small playground app ([playground/](playground/)) for manual testing.

## Prerequisites

- **Node.js ≥ 22**, npm ≥ 10
- **Tezos X Previewnet** access (RPC endpoints baked into the constants — no credentials needed for read access)
- **Chrome / Brave / Firefox** for loading either MV3 extension
- *Relayer POC extension only*: **Temple Wallet** installed and configured on Previewnet
- *Wallet only*: nothing else — it's self-contained
- *Mobile only*: an Expo **dev build** on a device or simulator (Expo Go is not supported — the app uses native modules)

## Setup

```bash
git clone https://github.com/trilitech/tezos-x-wallet
cd tezos-x-wallet
npm install            # installs all workspaces
```

## Repository layout

```
packages/
├── relayer/                  # @tezosx/relayer — cross-runtime SDK
│   ├── src/                  # domain, ports, use-cases, shared, tezos/ + evm/ entry points
│   ├── extension/            # legacy Temple-backed MV3 extension (superseded POC)
│   └── CHANGELOG.md
├── core/                     # @tezosx/wallet-core — shared wallet engine
│   ├── src/                  # domain, ports, use-cases, adapters, composition,
│   │                         # background (keyring, approval queue), shared, view-models
│   └── CHANGELOG.md
├── wallet/                   # @tezosx/wallet — Chrome MV3 extension shell
│   ├── src/                  # background SW, content bridge, injected provider, ui
│   ├── e2e/                  # Playwright E2E suite (100% mocked network, record/replay)
│   └── CHANGELOG.md
└── mobile/                   # @tezosx/wallet-mobile — Expo / React Native shell
    ├── src/                  # screens, transport (WalletConnect), lock, adapters
    └── CHANGELOG.md
website/                      # Docusaurus, two doc instances (relayer + wallet)
playground/                   # Next.js dApp for manual testing
docs/                         # Repo-level working documents
.github/workflows/            # CI + Pages deployment
CHANGELOG.md                  # Historical release index (per-package changelogs are canonical)
```

## Development workflow

### Build the relayer

```bash
npm run build              # @tezosx/relayer IIFE bundle  → packages/relayer/dist/
npm run build:ext          # Relayer MV3 extension        → packages/relayer/extension/dist/
npm run dev:ext            # Auto-reload extension via web-ext
```

### Build the wallet

```bash
npm run wallet:build       # production build  → packages/wallet/dist/
npm run wallet:dev         # Vite dev server with HMR (CRXJS)
```

Then in `chrome://extensions`: enable Developer mode → **Load unpacked** → select `packages/wallet/dist/` (the wallet) or `packages/relayer/extension/` (the relayer POC — its manifest references the built `dist/` bundles).

`@tezosx/wallet-core` has no build step — it's raw TypeScript compiled by whichever shell imports it.

### Run the mobile app

```bash
npm run ios -w @tezosx/wallet-mobile        # or android
```

### Run the docs site

```bash
cd website && npm install && npm run start    # → http://localhost:3000
```

### Run the playground

```bash
cd playground && npm install && npm run dev   # → http://localhost:3000
```

## Quality gates

Before opening a PR, make sure these pass locally:

```bash
npm run lint                             # ESLint over relayer, relayer-extension, core, wallet and website sources
npm run typecheck                        # @tezosx/relayer + its extension
npm run typecheck:wallet                 # @tezosx/wallet
npm run typecheck:core                   # @tezosx/wallet-core
npm run test                             # unit suites: wallet + core + relayer (Vitest)
npm run test -w @tezosx/wallet-mobile    # mobile unit suite (runs separately, not in the root aggregate)
npm run test:e2e -w @tezosx/wallet       # Playwright E2E against the built extension
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the jobs `lint`, `typecheck-relayer`, `typecheck-wallet`, `typecheck-core`, `typecheck-website`, `test-wallet`, `test-relayer`, `test-core`, `build-relayer`, `build-extension`, `build-wallet`, and the **blocking `e2e-wallet` gate**, which downloads the exact `build-wallet` artifact and runs the Playwright suite against it (no rebuild).

## Making changes

1. **Branch from `main`**:
   ```bash
   git checkout -b <type>/<short-description>
   # examples: fix/wallet-approve-scroll, feat/mobile-walletconnect-pairing, docs/refresh-security-model
   ```

2. **Make your change** in the relevant package (`packages/relayer/`, `packages/core/`, `packages/wallet/`, `packages/mobile/`, or `website/`).

3. **Update the CHANGELOG** of the affected package(s) — add a new entry under the version you're cutting.

4. **Open a PR** on GitHub against `main` — include a summary of the change and the rationale.

## Commit conventions

Use these prefixes:

| Prefix | When to use |
|---|---|
| `feat:` | New feature or method |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Build, config, dependencies |
| `refactor:` | Code change with no behavior change |
| `style:` | Formatting / cosmetic, no code change |

Optional scopes for clarity: `feat(wallet): ...`, `fix(relayer): ...`, `feat(core): ...`, `fix(mobile): ...`, `docs(website): ...`.

Examples:
- `feat(relayer): expose resolveSyntheticHash on RelayerProvider`
- `fix(wallet): pre-estimate fees with safety buffer`
- `docs: rename Tezos L1 → Michelson runtime`

## Versioning

The four packages follow [Semantic Versioning](https://semver.org/) **independently**:

- **Patch** (`x.y.Z`) — bug fixes, doc updates, internal refactors with no public-API change
- **Minor** (`x.Y.0`) — new features or methods, backwards compatible
- **Major** (`X.0.0`) — breaking changes (EIP-1193 surface change, removed methods, kernel-version requirement)

When you cut a release for a package:

1. **Bump the version** in:
   - `packages/<pkg>/package.json`
   - For the wallet, also `packages/wallet/manifest.json` (must match `package.json`)
   - For the mobile app, also `packages/mobile/app.json`
   - The relayer POC extension's `manifest.json` is frozen at 0.4.1 and decoupled from the relayer package version — do not bump it

   There are no hand-edited version strings anywhere else: the wallet's Settings page (`packages/wallet/src/ui/pages/Settings/`) and the service-worker boot log read the build-time defines `__WALLET_VERSION__` / `__CORE_VERSION__`, injected by `packages/wallet/vite.config.ts` from the respective `package.json` files.
2. **Add an entry** to `packages/<pkg>/CHANGELOG.md` — the per-package changelogs are the source of truth (the root [`CHANGELOG.md`](CHANGELOG.md) is a frozen historical index and is no longer updated)
3. **Snapshot the docs** if applicable:
   ```bash
   cd website
   npx docusaurus docs:version 0.X.Y           # for relayer docs
   npx docusaurus docs:version:wallet 0.X.Y    # for wallet docs
   ```
4. After the PR is merged, **tag the release** on `main` with the `<package>-vX.Y.Z` format (prefixes: `relayer-`, `wallet-core-`, `wallet-`, `wallet-mobile-`):
   ```bash
   git tag -a "wallet-v0.17.0" -m "Wallet 0.17.0"
   git push origin "wallet-v0.17.0"
   ```
5. Create a **GitHub Release** from that tag with the relevant CHANGELOG section as notes.

## Key concepts

- **EIP-1193** — `window.ethereum` interface used by Ethereum dApps
- **EIP-6963** — multi-wallet discovery (`eip6963:announceProvider`)
- **NAC gateway** — Tezos X cross-runtime contract `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`, entrypoints `call` (bare native transfers, carrying a `%call` HTTP request to `http://ethereum/<0x>`) and `call_evm` (ABI calldata-bearing calls)
- **Michelson runtime / EVM runtime** — Tezos X's two execution surfaces. Same ledger, different VMs. A `tz1` lives natively on the Michelson runtime; its EVM alias lives on the EVM runtime
- **AliasForwarder** — kernel mechanism that reroutes any native XTZ sent to a 0x alias back to its tz1 of origin (so an EVM-alias `eth_getBalance` is structurally 0)
- **Beacon SDK** — wallet connection protocol used by the relayer to delegate signing to Temple
- **Taquito `InMemorySigner`** — used by `TezosSigner` in `@tezosx/wallet-core` for keys-in-memory signing

For detailed architecture, see the [documentation site](https://trilitech.github.io/tezos-x-wallet/).

## Questions

- Open an issue on GitHub: https://github.com/trilitech/tezos-x-wallet/issues
- Reach out in the Slack channel `#techrel-tezosx-mvp`
