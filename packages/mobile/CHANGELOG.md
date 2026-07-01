# Changelog — @tezosx/wallet-mobile

The Tezos X wallet for iOS/Android (React Native, Expo bare). Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/). The app consumes the
shared `@tezosx/wallet-core` over the workspace; only platform adapters
(storage, secure RNG, biometrics) and the UI live here.

## [Unreleased]

### Added
- Full in-app design pass — the extension's UI recreated natively. A React Native
  design system (the stroke icon set via `react-native-svg` + ~30 pure `ui/tx`
  components) and every screen: Welcome, Create, Import, Unlock, Home, Send,
  Receive, Activity, Connections, Approve, Settings, AccountSwitcher, AddAccount,
  AddToken, Tokens — behind a tab + modal-stack shell with sheets and toasts. The
  theme is realigned to the extension's exact `--tx-*` tokens, and the XTZ / USDC
  / Tezos X brand logos are the same assets the extension ships (copied into
  `src/assets/logos`). It is driven by mock data through a single `WalletContext`
  seam, so reconnecting the live composition (keyring / balances / WalletConnect)
  is a data-layer change. This replaces the earlier WalletConnect-wired screens,
  which remain in git history and whose modules (`composition`/`transport`/
  `adapters`) stay in the tree for that reconnection. `theme.ts` is realigned to
  the design's exact `--tx-*` palette, spacing, radii and type scale (the mobile
  palette had drifted).
- WalletConnect: connect an external dApp. Paste a dApp's `wc:` URI on Home to
  pair (Reown WalletKit over the relay); the incoming session proposal is routed
  through the shared core `dispatch` exactly as the extension routes a content-
  script request — minted requestId, the peer's url as the verified origin, an
  `eth_requestAccounts` envelope — which raises an in-app Approve modal. On
  approval the core resolves the account's EVM alias and writes the per-origin
  session, and the WC session is approved declaring `eip155:128064` (Tezos X EVM,
  previewnet) with that alias; `eth_accounts` is answered from the session over
  the same dispatch. Pairing is by pasted URI (no camera); the dApp must be open
  while pairing (no background reconnect yet).
- WalletConnect signing: a connected dApp can request `eth_sendTransaction`. For
  a tz1 account this routes through the NAC gateway (cross-runtime L1 → L2) over
  the same core dispatch; the Approve modal shows the dApp's EVM intent (to /
  amount) alongside what actually gets signed (the Michelson gateway call and the
  mutez debited), and the approval is gated behind a per-signature biometric
  confirmation (Face ID / Touch ID via the keystore). `personal_sign` is not
  offered on a tz1 account — the runtime can't produce one — so it is omitted
  from the session methods rather than surfaced and rejected.
- A single-chain approval strategy for WalletConnect: the wallet offers
  `eip155:128064` (its only chain) directly when a dApp doesn't request it,
  rather than reconciling to nothing; a mainnet-only dApp with hard requirements
  still declines on its side.
- A Connections screen (reachable from Home) listing the live WalletConnect
  sessions — dApp name, url, and the account exposed to each — with per-session
  disconnect from the wallet side. Revoking tears down the WC session (notifying
  the dApp) and, via a reconcile that runs whenever the session set changes,
  clears the stored session that gates `eth_accounts`. The same reconcile drops
  sessions a dApp revoked while the app was closed. WalletKit restores
  previously-approved sessions from its own storage on boot, so a dApp connected
  before the app closed reconnects when the wallet reopens.
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
