# Changelog — @tezosx/wallet-mobile

The Tezos X wallet for iOS/Android (React Native, Expo bare). Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/). The app consumes the
shared `@tezosx/wallet-core` over the workspace; only platform adapters
(storage, secure RNG, biometrics) and the UI live here.

## [Unreleased]

### Added
- WalletConnect: connect an external dApp. Paste a dApp's `wc:` URI on Home to
  pair (Reown WalletKit over the relay); the incoming session proposal is routed
  through the shared core `dispatch` exactly as the extension routes a content-
  script request — minted requestId, the peer's url as the verified origin, an
  `eth_requestAccounts` envelope — which raises an in-app Approve modal. On
  approval the core resolves the account's EVM alias and writes the per-origin
  session, and the WC session is approved declaring `eip155:128064` (Tezos X EVM,
  previewnet) with that alias; `eth_accounts` is answered from the session over
  the same dispatch. Connect-first: signing methods are intentionally not offered
  yet (a later effort, with biometrics per signature). Pairing is by pasted URI
  (no camera); the dApp must be open while pairing (no background reconnect yet).
- The mobile composition now builds the full `SwDeps` (container cache, approval
  queue with a mobile `ApprovalPresenter`, provider-event broadcast over WC), so
  the dApp surface reuses the core routing rather than a parallel implementation.
  `react-native-compat` is imported first in the entry; `@walletconnect/core` and
  `@walletconnect/types`/`utils` are pinned to 2.23.9 (matching WalletKit) and
  scoped to this package so the relayer's Beacon chain keeps its own copy.
- Import → unlock → balances, on-device. Import a BIP-39 mnemonic: derive the
  tz1 identity, encrypt the vault locally (PBKDF2 600k + AES-GCM via the @noble
  crypto port, randomness from `react-native-get-random-values`), persist the
  encrypted blob to MMKV, and seed the default tokens. Unlock by biometrics or
  password. Home reads real balances from previewnet — L1 XTZ (TzKT) plus ERC-20
  tokens on the EVM alias for a Tezos account.
- Two-layer storage: the encrypted vault blob, dApp sessions and the token
  registry live in MMKV (`react-native-mmkv`); the unlock password is sealed in
  the OS keystore (`react-native-keychain`) behind biometrics, bound to the
  device (`WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`, no iCloud sync) and invalidated
  by the OS when the biometric enrolment changes (`BIOMETRY_CURRENT_SET`), with
  password fallback.
- Auto-lock: the decrypted secret is evicted when the app backgrounds and after
  a foreground inactivity timeout — a mobile concern the extension didn't need
  (it relied on service-worker death).
- Platform adapters implementing the core ports: MMKV vault/session/token
  stores, a no-op notification port, the @noble crypto port, and a Keychain
  unlock-secret store. No `buildContainer` yet — the read-only milestone needs
  no signer/provider.
