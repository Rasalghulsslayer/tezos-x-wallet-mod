# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm install
```

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Repo-specific notes

- **Two doc trees**, served by two docs-plugin instances: `docs/` (the
  `@tezosx/relayer` SDK docs, routed under `/docs`) and `wallet-docs/` (the
  `@tezosx/wallet` product docs, routed under `/wallet`). Each is versioned
  independently (`versions.json` / `wallet_versions.json`).
- **Cutting a version snapshot**:
  ```bash
  npx docusaurus docs:version 0.X.Y           # relayer docs
  npx docusaurus docs:version:wallet 0.X.Y    # wallet docs
  ```
- **Experimental banner**: the "Experimental software · Pre-release POC · Do
  not use with mainnet funds" announcement bar is configured in
  `docusaurus.config.ts` (`themeConfig.announcementBar`, `isCloseable: false`).
  It is non-dismissable by design — do not remove it before a real mainnet
  release.

## Deployment

The site is deployed automatically to GitHub Pages by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every push
to `main` (it builds with `BASE_URL=/tezos-x-wallet/` and publishes
`website/build`). There is no manual `deploy` step — do not use
`npm run deploy`.
