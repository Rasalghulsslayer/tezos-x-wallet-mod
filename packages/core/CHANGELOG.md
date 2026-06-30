# Changelog — @tezosx/wallet-core

All notable changes to the shared wallet core are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the package
follows [Semantic Versioning](https://semver.org/). The core is consumed as raw
TypeScript source over the npm-workspace symlink (no build step), by both the
Chrome extension (`@tezosx/wallet`) and the React Native app
(`@tezosx/wallet-mobile`).

## [0.2.0] — 2026-06-30

### Added
- Shared, platform-neutral balance-fetcher adapters under `adapters/` — the
  Tezos and EVM balance readers (TzKT / Tezlink RPC over `fetch`), moved out of
  the extension so the mobile app reads balances through the same code instead
  of a parallel implementation. Exposed via `@tezosx/wallet-core/adapters/*`.
  These join the existing `@noble` crypto port as the package's "shared neutral
  adapters" (plain I/O), distinct from platform adapters — storage, crypto
  randomness, notifications, transport — which remain in each shell.
- The `accountCardVM` / `signingSourceAddress` presentation view-model under
  `view-models/`, projecting an unlocked vault state into a single- or dual-face
  account shape. Pure (no React/DOM), so both shells render from it. Exposed via
  `@tezosx/wallet-core/view-models/*`.

## [0.1.0] — 2026-06-29

### Added
- Initial extraction of the platform-neutral wallet core from the Chrome
  extension: the domain types and predicates (`domain/`), the ports the use
  cases talk through (`ports/`), the business logic (`use-cases/`), the keyring
  and approval queue, and the cross-layer helpers (`shared/` — formatting, seed
  and identity derivation, the EVM-signing primitives, and the platform-neutral
  vault-crypto envelope). The vault envelope drives both a Web Crypto port
  (extension) and an `@noble` port (mobile/Hermes) and is proven byte-identical
  across them, so a vault sealed on one runtime opens on the other.
