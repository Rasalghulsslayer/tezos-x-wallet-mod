# Contributing to Tezos X Relayer

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Temple Wallet (browser extension or mobile)
- Access to the Tezos X shadownet (contact the team for RPC credentials)

## Setup

```bash
git clone https://gitlab.com/tezos-infra/techrel/support-xdev-qa/tezosx-relayer
cd tezosx-relayer
npm install
npm run build
# → dist/relayer.iife.js
```

## Project structure

```
src/                  TypeScript source — relayer core
  provider.ts         EIP-1193 provider class
  beacon.ts           Temple/Beacon SDK integration
  gateway.ts          CRAC Micheline call builder
  tezlink.ts          Tezlink RPC client
  index.ts            Entry point — window.ethereum injection + EIP-6963 announcement
dist/                 Built IIFE bundle (gitignored output)
frontend/             Next.js playground for manual testing
website/              Docusaurus documentation site
docs/                 Loose markdown guides (tampermonkey, etc.)
```

## Development workflow

### Build the relayer

```bash
npm run build        # production build → dist/relayer.iife.js
npm run typecheck    # TypeScript check without compiling
```

### Serve locally (for Tampermonkey injection)

```bash
npm run serve        # serves dist/ on http://localhost:8080
```

### Run the playground frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

### Run the docs site

```bash
cd website
npm install
npm start            # http://localhost:3000
```

## Making changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes** in `src/`

3. **Build and test** manually via the playground or Tampermonkey injection

4. **Open a Merge Request** on GitLab — describe what changed and why

## Commit conventions

Use the following prefixes:

| Prefix | When to use |
|---|---|
| `feat:` | New feature or method |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Build, config, dependencies |
| `refactor:` | Code change with no behavior change |

Example: `feat: implement eth_call via Tezlink proxy`

## Versioning

Versions follow [Semantic Versioning](https://semver.org/):
- **Patch** (`0.1.x`) — bug fixes
- **Minor** (`0.x.0`) — new methods or features, backwards compatible
- **Major** (`x.0.0`) — breaking changes to the provider API

Update `package.json` version and run `npm run docusaurus docs:version <version>` in `website/` when cutting a release.

## Key concepts

- **EIP-1193** — the `window.ethereum` interface dApps use to interact with wallets
- **EIP-6963** — multi-wallet discovery via `eip6963:announceProvider` / `eip6963:requestProvider` events
- **CRAC gateway** — Tezos X cross-runtime contract at `KT1...`, entrypoint `callMichelson`
- **Beacon** — wallet connection protocol used by Temple

Refer to the [documentation site](https://tezos-infra.gitlab.io/techrel/support-xdev-qa/tezosx-relayer/) for architecture details.

## Questions

Open an issue on GitLab or reach out in the `#techrel-tezosx-mvp` Slack channel.
