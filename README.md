# Tezos X — Relayer & Wallet

Monorepo containing two products that bridge Ethereum-compatible dApps to **Tezos X**:

- **[`@tezosx/relayer`](packages/relayer)** — Injectable EIP-1193 provider that exposes `window.ethereum` to dApps and routes transactions through **Temple Wallet** and the Tezos X NAC cross-runtime gateway.
- **[`@tezosx/wallet`](packages/wallet)** — Standalone Chrome MV3 wallet that signs transactions locally with a built-in `LocalSignerClient` (no Temple required) and embeds the relayer for dApp connectivity.

Full architecture, API reference and user flows are documented on the **[documentation site](https://trilitech.github.io/tezos-x-wallet/)**.

## Repository layout

```
packages/
├── relayer/       # @tezosx/relayer — IIFE bundle + MV3 extension (Temple-backed)
└── wallet/        # @tezosx/wallet — standalone MV3 wallet
website/           # Docusaurus site (two doc instances, versioned independently)
playground/        # Next.js demo dApp for manual testing
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

### Run the docs locally

```bash
cd website && npm install && npm run start
```

## Loading either extension in Chrome

1. `chrome://extensions` → **Developer mode** ON
2. **Load unpacked** → select `packages/relayer/extension/dist/` *or* `packages/wallet/dist/`

For the relayer, you also need **Temple Wallet** installed and connected to Tezos X Previewnet. The wallet is self-contained — no Temple needed.

## Network — Tezos X Previewnet

| | Value |
|---|---|
| EVM RPC | `https://evm.previewnet.tezosx.nomadic-labs.com` |
| Michelson RPC | `https://michelson.previewnet.tezosx.nomadic-labs.com` |
| Chain ID | `0x1f440` (128064) |
| EVM explorer | [Blockscout](https://blockscout.previewnet.tezosx.nomadic-labs.com) |
| L1 explorer | [tzkt](https://previewnet.tezosx.tzkt.io) |
| NAC gateway | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` |

## Releases

The two packages are versioned **independently**. See:
- [packages/relayer/CHANGELOG.md](packages/relayer/CHANGELOG.md)
- [packages/wallet/CHANGELOG.md](packages/wallet/CHANGELOG.md)
- [Root release index](CHANGELOG.md)

Tags follow the npm-style scoped format: `@tezosx/relayer@X.Y.Z`, `@tezosx/wallet@X.Y.Z`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Lint + typechecks run automatically on every PR via [GitHub Actions](.github/workflows/ci.yml); the documentation site is deployed to GitHub Pages on every push to `main`.

## License

MIT — see [LICENSE](LICENSE).
