# Contributing to Tezos X — Relayer & Wallet

This monorepo ships **two independently versioned packages**:

- **`@tezosx/relayer`** ([packages/relayer/](packages/relayer/)) — Injectable EIP-1193 provider that routes EVM dApp calls to Tezos X via Temple Wallet and the NAC gateway.
- **`@tezosx/wallet`** ([packages/wallet/](packages/wallet/)) — Standalone Chrome MV3 wallet that signs locally and embeds the relayer.

Plus the documentation site ([website/](website/), Docusaurus, two doc instances) and a small playground app ([playground/](playground/)) for manual testing.

## Prerequisites

- **Node.js ≥ 22**, npm ≥ 10
- **Tezos X Previewnet** access (RPC endpoints baked into the constants — no credentials needed for read access)
- **Chrome / Brave / Firefox** for loading either MV3 extension
- *Relayer only*: **Temple Wallet** installed and configured on Previewnet
- *Wallet only*: nothing else — it's self-contained

## Setup

```bash
git clone https://github.com/trilitech/tezos-x-wallet
cd tezos-x-wallet
npm install            # installs all workspaces
```

## Repository layout

```
packages/
├── relayer/                  # @tezosx/relayer
│   ├── src/                  # provider, gateway, tezlink, beacon, types
│   ├── extension/            # MV3 extension (popup + manifest)
│   └── CHANGELOG.md
└── wallet/                   # @tezosx/wallet
    ├── src/
    │   ├── background/       # service worker (keyring, signer, approval queue)
    │   ├── content/          # ISOLATED-world bridge
    │   ├── injected/         # MAIN-world EIP-1193 provider
    │   ├── lib/              # shared utilities (address, format, balances, …)
    │   └── ui/               # popup + approval React app
    └── CHANGELOG.md
website/                      # Docusaurus, two doc instances (relayer + wallet)
playground/                   # Next.js dApp for manual testing
.github/workflows/            # CI + Pages deployment
CHANGELOG.md                  # Monorepo release index (per-package details linked)
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

Then in `chrome://extensions`: enable Developer mode → **Load unpacked** → select `packages/relayer/extension/dist/` or `packages/wallet/dist/`.

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
npm run lint               # ESLint on relayer/wallet/website src
npm run typecheck          # @tezosx/relayer + extension
npm run typecheck:wallet   # @tezosx/wallet
```

CI runs the same checks plus `build:wallet`, `build:ext`, `build:relayer`, `build:website`. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Making changes

1. **Branch from `main`**:
   ```bash
   git checkout -b <type>/<short-description>
   # examples: fix/wallet-0.4.1, feat/relayer-personal-sign, docs/clarify-routing
   ```

2. **Make your change** in the relevant package (`packages/relayer/`, `packages/wallet/`, or `website/`).

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

Optional scopes for clarity: `feat(wallet): ...`, `fix(relayer): ...`, `docs(website): ...`.

Examples:
- `feat(relayer): expose resolveSyntheticHash on RelayerProvider`
- `fix(wallet): pre-estimate fees with safety buffer`
- `docs: rename Tezos L1 → Michelson runtime`

## Versioning

The two packages follow [Semantic Versioning](https://semver.org/) **independently**:

- **Patch** (`x.y.Z`) — bug fixes, doc updates, internal refactors with no public-API change
- **Minor** (`x.Y.0`) — new features or methods, backwards compatible
- **Major** (`X.0.0`) — breaking changes (EIP-1193 surface change, removed methods, kernel-version requirement)

When you cut a release for a package:

1. **Bump the version** in:
   - `packages/<pkg>/package.json`
   - For the wallet, also `packages/wallet/manifest.json`, the SW boot log in `packages/wallet/src/background/service-worker.ts`, and the "Version" row in `packages/wallet/src/ui/pages/Settings.tsx`
   - For the relayer extension, also `packages/relayer/extension/manifest.json`
2. **Add an entry** to `packages/<pkg>/CHANGELOG.md` and a one-line summary to the root [`CHANGELOG.md`](CHANGELOG.md)
3. **Snapshot the docs** if applicable:
   ```bash
   cd website
   npx docusaurus docs:version 0.X.Y           # for relayer docs
   npx docusaurus docs:version:wallet 0.X.Y    # for wallet docs
   ```
4. After the PR is merged, **tag the release** on `main` with the npm-style scoped name:
   ```bash
   git tag -a "@tezosx/wallet@0.X.Y" -m "Wallet 0.X.Y"
   git push origin "@tezosx/wallet@0.X.Y"
   ```
5. Create a **GitHub Release** from that tag with the relevant CHANGELOG section as notes.

## Key concepts

- **EIP-1193** — `window.ethereum` interface used by Ethereum dApps
- **EIP-6963** — multi-wallet discovery (`eip6963:announceProvider`)
- **NAC gateway** — Tezos X cross-runtime contract `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`, entrypoints `default` (bare transfer) and `call_evm` (calldata-bearing call)
- **Michelson runtime / EVM runtime** — Tezos X's two execution surfaces. Same ledger, different VMs. A `tz1` lives natively on the Michelson runtime; its EVM alias lives on the EVM runtime
- **AliasForwarder** — kernel mechanism that reroutes any native XTZ sent to a 0x alias back to its tz1 of origin (so an EVM-alias `eth_getBalance` is structurally 0)
- **Beacon SDK** — wallet connection protocol used by the relayer to delegate signing to Temple
- **Taquito `InMemorySigner`** — used by `LocalSignerClient` in the wallet for keys-in-memory signing

For detailed architecture, see the [documentation site](https://trilitech.github.io/tezos-x-wallet/).

## Questions

- Open an issue on GitHub: https://github.com/trilitech/tezos-x-wallet/issues
- Reach out in the Slack channel `#techrel-tezosx-mvp`
