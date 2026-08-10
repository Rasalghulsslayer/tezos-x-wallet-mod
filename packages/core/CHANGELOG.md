# Changelog — @tezosx/wallet-core

All notable changes to the shared wallet core are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the package
follows [Semantic Versioning](https://semver.org/). The core is consumed as raw
TypeScript source over the npm-workspace symlink (no build step), by both the
Chrome extension (`@tezosx/wallet`) and the React Native app
(`@tezosx/wallet-mobile`).

## [0.5.0] — 2026-08-10

### Added
- **Address book.** A wallet-global contact registry — a user-chosen label over
  a public tz1/tz2/tz3/KT1 or 0x address — behind a new `ContactStore` port
  (`ports/contact-store.ts`), deliberately not per-account: contacts belong to
  the user, and every account sends to the same peers. Pure domain in
  `domain/contact.ts` (identity normalization lowercases hex addresses but the
  raw input is validated first, so a wrong EIP-55 checksum is rejected rather
  than laundered by the lowercasing; labels share `MAX_LABEL_LENGTH`); four
  use-cases (`addContact` with duplicate and `MAX_CONTACTS = 50` cap guards,
  `renameContact`, `removeContact` idempotent, `listContacts` label-sorted);
  shared UI projections in `view-models/contacts-vm.ts` (`contactFor`,
  `matchContacts`, `shouldOfferSaveContact`) so both shells resolve names and
  build recipient suggestions from one implementation. Four new popup messages
  (`ADD_CONTACT`, `RENAME_CONTACT`, `REMOVE_CONTACT`, `LIST_CONTACTS`) with
  unlock-gated dispatch branches; `PersistentPorts` gains a required
  `contactStore`, so each shell wires its platform adapter at compile time.
  Contacts are non-secret metadata (public addresses and labels only).

## [0.4.0] — 2026-07-12

### Added
- HD multi-account derivation from a single seed phrase. The vault payload is
  now version 3 and can carry a wallet-level BIP-39 phrase (`seed`), written
  only by mnemonic onboarding — the first account sits at the historical index
  0 path, so its address is unchanged. `AddAccountSource` gains
  `{ source: 'derived' }`: the keyring derives the next unused per-curve index
  (`m/44'/1729'/i'/0'` for Tezos, `m/44'/60'/0'/0/i` for EVM via the new
  `deriveEvmFromMnemonic` on `@scure/bip32`), stores only
  `{ kind: 'derived', index }` — nothing new to back up — and refuses with
  `NoWalletSeedError` when the vault has no phrase (seedless imports). Gaps
  from removed accounts are not reused; removing the highest index and
  re-adding derives the same address again, so derived funds are always
  recoverable. Reveal flows resolve a derived marker to the concrete edsk /
  EVM private key (`RevealedSecret`); the phrase itself has its own
  password-gated path (`exportWalletSeed`, `EXPORT_WALLET_SEED`).
  `VaultStateUnlocked` gains `hasSeed` and `AccountSummary` gains
  `derivationIndex` (both additive). Existing v2 vaults migrate on read —
  same password, same envelope, byte-identical signing keys for all three
  legacy secret kinds — and never gain a seed by migration, because the
  provenance of a v2 mnemonic is unknowable; their derived option simply
  stays hidden.
- `trackCrossRuntimeTx` in `shared/tx-status.ts` — status tracking for a
  Tezos → EVM gateway transfer that reports progress honestly. The kernel
  synthesizes the EVM transaction only after the L1 operation lands, and by
  the time the synthetic hash resolves the receipt's block has usually already
  reached the `finalized` tag — so polling the L2 receipt alone sits silent
  through the whole inclusion window, then jumps straight to finalized. The
  new tracker drives 'included' from the L1 operation on TzKT (capped there:
  finality for this transfer means the L2 receipt's block reached the
  finalized tag, not L1 attestation depth) and hands over to the L2 receipt
  once the real hash is known. To feed it, the NAC gateway path of
  `sendTransfer` now returns the underlying `l1OpHash` (`ProviderPort` gains
  the optional `getPendingL1Hash`).

### Changed
- **Breaking (type):** `UnlockedSession` / `UnlockedKeyring` no longer carry a
  `secretKey` field (see Security — the unlocked session retains no signing
  key). Consumers needing signing material use `getSigningKeyFor(accountId)`.
- **Breaking (type):** an unlocked keyring no longer retains the vault
  password. `UnlockedKeyring.password` is replaced by `UnlockedKeyring.km` —
  the PBKDF2-derived AES key plus the salt / work factor it was derived at.
  Vault mutations re-seal with that key (fresh IV, pinned salt), account
  removal re-verifies the password by deriving a candidate key and comparing
  in constant time, and vaults sealed at older work factors are upgraded to
  600k iterations at unlock (the one moment the password is in scope) instead
  of at the next mutation. The key is zeroized on lock. Sealed-envelope format
  and cross-runtime portability are unchanged; `deriveVaultKey`,
  `encryptVaultWithKey`, `decryptVaultWithKey` and `freshVaultSalt` are
  additive on `shared/vault-crypto`.

### Security
- Security-review remediation (2026-07-09 pass over the 2026-07-03 audit):
  - **Unlock throttle/lockout.** The keyring takes an optional
    `UnlockGuardStore`; after a few wrong passwords it arms an exponential,
    capped lockout (persisted, so it survives a service-worker restart —
    the plaintext-on-disk vault is otherwise open to unbounded offline
    guessing). Cleared on a correct unlock. Throws `UnlockThrottledError`.
  - **`accountsChanged` is scoped per origin.** Switching the active account
    no longer broadcasts the new alias to every connected origin (each origin
    stays bound to the account it connected with); the push carries an
    optional `origin`, and removing an account notifies only that account's
    origins with `[]` and drops their sessions.
  - **Per-origin approval cap.** `ApprovalQueue` refuses more than
    `MAX_PENDING_PER_ORIGIN` in-flight requests from one origin
    (`TooManyPendingRequestsError` → JSON-RPC -32005), bounding popup floods.
  - **Native sub-mutez transfers are rejected, not floored.** The tz1→tz1 and
    EVM→tz1 paths now use the relayer's `weiToMutezExact`, so a sub-mutez
    amount errors instead of silently transferring 0.
  - **ERC-20 from a tz1 account signs a real `transfer(address,uint256)`** to
    the token contract (value 0), scaled by the token's decimals, instead of
    the raw amount as calldata.
  - **Cross-runtime resolution state persists.** The `RelayerProvider` takes an
    optional per-account `PendingOpsStore` (added to `PersistentPorts`), so a
    synthetic→real hash mapping survives lock / switch / SW eviction.
  - **Recipient checksum is enforced.** `detectRuntime` now treats a mixed-case
    `0x` address whose EIP-55 checksum is wrong as unroutable (a likely typo),
    while still accepting all-lowercase or all-uppercase input, which carries no
    checksum information.
  - **Imported EVM keys are range-checked.** A private key of zero or one at or
    above the secp256k1 group order is rejected on import rather than deriving a
    degenerate account.
  - **Duplicate accounts are refused at import.** The keyring rejects importing a
    tz1 or `0x` address it already holds, matching the guard the derived-account
    path already had.
  - **A transfer to the sender's own address is refused** before signing, on both
    the Tezos and EVM source paths.
  - **Vault iteration count is bounded at decrypt.** `deriveVaultKey` rejects a
    non-positive or absurdly large PBKDF2 iteration count read from a sealed
    envelope, so a tampered header can't force a denial-of-service stretch.
  - **The EVM provider refuses signing methods it doesn't implement.**
    `eth_sign`, `eth_signTransaction`, and the `eth_signTypedData*` family are
    rejected with the EIP-1193 unsupported-method code instead of being proxied
    to the remote node (which holds no key); `eth_sign` blind signing is refused
    outright.
  - **The Tezos fee retry is capped.** The one-shot resubmit that trusts the
    node's reported `required` fee now refuses any value beyond a bounded
    multiple of the already-padded fee, so a hostile or buggy RPC can't drain the
    balance in fees.
  - **Decoded signing messages reject deceptive characters.** The best-effort
    UTF-8 decode used to preview a `personal_sign` payload returns nothing when
    the text contains bidi overrides/isolates or zero-width characters, so the
    approval UI falls back to raw hex rather than a string that renders
    differently from what is signed.
  - **The cross-runtime approval names the method.** The gateway builder surfaces
    the resolved ABI signature (e.g. `transfer(address,uint256)`), which the
    pending transaction now carries so the approval popup shows the method
    instead of a bare selector.
  - **Dev logging is gated on `__DEV__`.** The `devLog` flag prefers React
    Native's `__DEV__` (false in release builds), falling back to
    `NODE_ENV` for the Vite and Node toolchains, so a Metro/Hermes build with an
    undefined `NODE_ENV` can no longer leak signed payloads to the device log.
  - **The unlocked session no longer retains the active account's signing
    key.** `UnlockedKeyring.secretKey` was derived at unlock and on every
    mutation, then never read — every signing path already derives on demand
    through `getSigningKeyFor` — so it was pure retained key material (and a
    stale copy after `activateInMemory`). The field is gone; unlock and
    mutations also skip the wasted derivation. The full retention contract
    (what stays in memory while unlocked and why: the decrypted `payload`, the
    derived vault key `km` — raw bytes because the CryptoPort is shared with
    the mobile OpenSSL port, zeroized on lock; never the password, never a
    signing key) is now documented on `UnlockedKeyring` itself.
- Transient secret byte-buffers are zeroized immediately after use: the
  PBKDF2-derived vault key and the decrypted vault plaintext bytes in
  `shared/vault-crypto`, and the private-key / signature buffers in the shared
  EVM signing path (`shared/wipe.ts` provides the best-effort `wipe` helper
  and a constant-time comparison). JavaScript strings remain immutable and
  GC-bound, and Taquito / noble keep internal copies out of reach — this
  shortens the window secrets stay readable in memory rather than
  guaranteeing erasure. Sealed-envelope bytes are unchanged, so vault
  portability across the extension and mobile is unaffected.

- `Keyring.activateInMemory(accountId)` + `Keyring.flushActive()` — a deferred
  path for switching the active account. `setActiveAccount` re-seals the whole
  vault (a 600k-PBKDF2 encrypt) to persist the active pointer, which is
  imperceptible on the extension's Web Crypto but stalls the mobile app's pure-JS
  Hermes crypto for seconds on every switch. `activateInMemory` flips the active
  pointer in memory only — synchronous, no encrypt, no signing-key derivation
  (the container builder re-derives on demand via `getSigningKeyFor`, and no
  signing path reads `unlocked.secretKey`) — and marks the pointer dirty;
  `flushActive` writes it to disk later, off the interaction path. The extension
  keeps calling `setActiveAccount` (its synchronous persist matters because its
  service worker can die at any moment); the mobile shell uses the deferred pair.
  A crash between the two at worst forgets the last selection (the persisted
  active is restored on unlock). Purely additive — `setActiveAccount` / `persist`
  behaviour is unchanged.

## [0.3.0] — 2026-06-30

### Added
- The remaining platform-neutral adapters — the Tezos and EVM signers, the EVM
  JSON-RPC provider, the two activity fetchers, and the NAC precompile builder —
  moved out of the extension into `adapters/{tezos,evm}/`, joining the
  balance-fetchers already there. They are plain I/O (`fetch`, `@taquito`,
  `@noble`, `@tezosx/relayer`, `eventemitter3`; no `chrome.*`, no DOM), so both
  shells now sign and read through the same code rather than a parallel mobile
  implementation. Exposed via `@tezosx/wallet-core/adapters/*`.
- The composition wiring root — `buildContainer` (`composition/container.ts`),
  `ensureContainerFor` (`container-builder.ts`), the container cache, and the
  service-worker message router `dispatch` with its `SwState`/`SwDeps` shapes
  (`sw-wiring.ts`) — moved to `composition/`. The full EIP-1193 / dApp routing,
  approval flow, and per-account Container now live in the core, so the mobile
  WalletConnect transport drives the exact same `dispatch` as the extension's
  service worker. Exposed via `@tezosx/wallet-core/composition/*`.
- `shared/log.ts` (the dev-only `devLog`) moved into the core. Its dev flag now
  reads `process.env.NODE_ENV`, which every consumer's bundler folds to a literal
  — Vite (extension), Metro/Hermes (mobile), and Node (tests) — so verbose and
  sensitive diagnostics are dead-code-eliminated from every production build. It
  previously stayed in the extension because it relied on Vite-only
  `import.meta.env`, which Metro does not parse.

### Changed
- Added `@taquito/taquito`, `@taquito/rpc`, and `eventemitter3` to the package's
  dependencies, now that the signer and provider adapters live here.

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
