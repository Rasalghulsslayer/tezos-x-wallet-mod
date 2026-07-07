# Changelog — @tezosx/wallet-mobile

The Tezos X wallet for iOS/Android (React Native, Expo bare). Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/). The app consumes the
shared `@tezosx/wallet-core` over the workspace; only platform adapters
(storage, secure RNG, biometrics) and the UI live here.

## [Unreleased]

### Added
- Real dApp surface behind the design (fifth reconciliation step). The Approve
  sheet and Connections screen run on the live WalletConnect transport + the core
  approval queue instead of mocks. Scanning a dApp's WalletConnect QR with the
  camera — or pasting its `wc:` link — on Connections pairs over the relay; the
  incoming proposal (and any `eth_sendTransaction`)
  routes through the shared core dispatch, which suspends on the Approve sheet —
  now driven by the real pending request (observed via `approvalUi`, resolved off
  the ApprovalQueue), showing the actual origin, the pinned account, and for a
  cross-runtime transaction both the dApp's EVM intent and the Michelson gateway
  call the tz1 actually signs. Approving is gated behind the same per-signature
  biometric confirm the Send flow uses (fail-closed; a no-op on password-only
  devices), then resolves the request so the dApp gets its answer; rejecting or
  dismissing the sheet answers the dApp with a rejection. Connections lists the
  live per-origin sessions and keeps them fresh as they come and go; revoking one
  tears down both the WalletConnect session and the stored per-origin entry.
  WalletConnect boots on unlock and restores previously-approved sessions. A
  request the runtime can't satisfy — an EVM message signature (`personal_sign`
  / typed data), which a tz1 account has no key for — is rejected promptly (4200)
  instead of surfacing an approval that would fail. Connecting asks how to pair —
  scan the dApp's WalletConnect QR (camera, via `expo-camera`) or paste its link.
- Real Send flow (fourth reconciliation step). The review's Confirm & send now
  calls the core `sendTransfer` through the active account's warm container
  instead of fabricating a hash: a tz1 → tz1 transfer returns the L1 op hash; a
  tz1 → 0x cross-runtime transfer returns a synthetic NAC hash that the screen
  then resolves to the real EVM hash by polling `resolveTx` (2s, up to 60s,
  falling back to the intermediate hash if the kernel mapping hasn't
  materialised); an EVM-account send returns the real hash directly. Signing is
  gated behind a per-signature biometric confirm (Face ID / Touch ID; a no-op on
  password-only devices, fails closed otherwise). The done screen's
  StatusTimeline is driven by the real `trackTx` (TzKT for L1 inclusion /
  finality, the Tezlink EVM RPC for L2), replacing the cosmetic timers; a failed
  or unavailable status surfaces an ErrorCard, and the hash line links out to
  tzkt / blockscout. The human amount is converted to hex wei and the screen's
  asset selection mapped to the core Asset union at the seam; the resolve and
  track pollers stop on unmount. The status timeline now marks its final
  "Finalized" step complete on finality (it previously stayed on the pulsing
  active step, as the renderer had no state beyond finalized), and long detail
  values (the cross-runtime routing line) and large amounts wrap instead of
  overflowing their rows.
- Account and token management, wired to the vault (third reconciliation step).
  Add Account now creates a real account in the unlocked vault — a fresh 24-word
  Tezos mnemonic or a fresh EVM key (the phrase the user reveals and backs up is
  exactly the one persisted, never a divergent keyring-minted one), or an
  imported mnemonic / edsk / 0x key, each validated before submit — then makes it
  active so Home re-scopes to it. Add Token reads a contract's symbol / name /
  decimals straight from chain (a non-persisting peek) to preview before
  committing; a contract that doesn't answer `decimals()` offers a "Try anyway"
  path that registers it at 18 decimals, and duplicate / cap / invalid-address
  failures surface through `formatError`. Manage-tokens removes a registered
  ERC-20 (the built-in USDC seed stays protected). Each mutation warms the active
  account's container and refreshes the affected reads. Reveal-secret was already
  live per-account; renaming an account is the one remaining account operation,
  deferred until it has a design surface.
- Live balances, tokens and activity behind the design (second reconciliation
  step). Home, Tokens, Send and Activity now read the active account off a
  per-account data effect (`use-account-data`) instead of fixtures: the L1 XTZ
  balance from TzKT (or, for an EVM account, its balance from the Tezlink RPC),
  each registered ERC-20's balance on the account's EVM alias, the token
  registry, and the merged TzKT + Blockscout activity feed. Each is surfaced as
  loading / value / error — a spinner while a read is in flight, an `ErrorCard`
  (through `formatError`) when one fails. Activity items map through a pure
  `activity-vm` into the row shape the list renders; the stale band now reflects
  the feed's real staleness rather than always showing; and the header Refresh
  re-runs the reads. Switching accounts warms that account's container and
  re-scopes every read, and locking drops the container and clears the slices.
- Real vault lifecycle behind the design UI (first reconciliation step). The
  WalletContext is now the app's composition root over the live keyring: a
  network-free boot Gate resolves onboarding / locked / unlocked; Create
  generates a real BIP-39 mnemonic (or EVM key) and persists it; Import brings in
  a mnemonic / edsk / 0x key; Unlock is biometric-first (Face ID / Touch ID
  releases the sealed password) with a password fallback; lock + auto-lock evict
  the secret; Settings reveals the real secret via exportSecret. Errors surface
  through formatError. Accounts render through a ViewAccount adapter over the core
  AccountSummary / accountCardVM (identicons seed on the address). dApp sessions
  are still a shim — wired in a later step.
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
