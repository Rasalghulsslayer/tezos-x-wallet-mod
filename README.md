# Tezos X Relayer

Injectable EIP-1193 provider that exposes `window.ethereum` to Etherlink dApps, routing all transactions through Temple Wallet and the Tezos X NAC cross-runtime gateway.

Full architecture, API reference and user flows are documented on the [documentation site](https://tezosx-relayer-9c5cf1.gitlab.io/).

## Quick start

```bash
npm install
```

### Run the relayer locally (script-tag / Tampermonkey)

```bash
npm run build       # produces dist/relayer.iife.js
npm run serve       # serves the bundle at http://localhost:8080
```

See the [injection methods](https://tezosx-relayer-9c5cf1.gitlab.io/docs/technical/injection) doc for how to inject the IIFE bundle into a dApp page.

### Run the Chrome extension (recommended)

MV3 extension for Chrome / Brave / Firefox. Injects `window.ethereum` automatically on every page — no manual setup.

```bash
npm run build:ext   # produces extension/dist/
npm run dev:ext     # launches Chromium with the extension loaded
```

Or load it manually: `chrome://extensions` → **Developer mode** → **Load unpacked** → select the `extension/` folder.

See the [installation guide](https://tezosx-relayer-9c5cf1.gitlab.io/docs/installation) for details.

### Run the documentation site locally

```bash
cd website
npm install
npm run start       # → http://localhost:3000
```

### Run the playground locally

A Next.js app for manual testing (connect, transfer, Counter interactions).

```bash
cd playground
npm install
npm run dev         # → http://localhost:3000
```

## Syncing the extension with the latest relayer code

The extension bundles the relayer source directly from `src/` — there is no
separate copy. After pulling new relayer changes, rebuild the extension:

```bash
git pull
npm install          # in case dependencies changed
npm run build:ext    # rebuilds extension/dist/ with the latest src/
```

Then reload it in the browser:

- **Chrome / Brave**: `chrome://extensions` → find *TezosX Relayer* → click the
  **⟳ reload** icon on the card.
- **Firefox**: `about:debugging` → *This Firefox* → click **Reload** next to
  the extension.

If you are running `npm run dev:ext`, the extension is reloaded automatically
on every `build:ext`.

Bump the version if the change is user-visible:

1. Update `"version"` in both `package.json` and `extension/manifest.json`.
2. Add an entry to [CHANGELOG.md](./CHANGELOG.md).
3. Snapshot the docs: `cd website && npx docusaurus docs:version <new>`.
4. Tag the release: `git tag v<new>` on the merge commit.

## Prerequisite: Temple Wallet

1. Open Temple extension → **Settings** → **Networks** → **Add network**
2. Name: `Tezos X Testnet` — RPC URL: `https://demo.txpark.nomadic-labs.com/rpc/tezlink`
3. Switch to this network before interacting with any dApp
