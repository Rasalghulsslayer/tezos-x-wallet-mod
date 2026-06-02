# Changelog — TezosX Wallet

All notable changes to the TezosX Wallet are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.10.1] — 2026-06-02

### Changed
- **L2 transaction finality now uses the `finalized` block tag** on the Tezlink EVM RPC instead of a 2-confirmation heuristic. Per Thomas Letan's feedback (`#techrel-tezosx-mvp`, 2026-05-15), the deciding factor for L2 finality on Tezos X is **L1 inclusion**, not L2 block count above the tx — L2 blocks above the tx provide no additional guarantee beyond the L1 finality of the block they share. `pollL2` in `shared/tx-status.ts` now polls `eth_getBlockByNumber("finalized", false)` and considers the tx finalised when `txBlockNumber <= finalizedBlockLevel`. The `TxStatus['finalized']` shape gains an optional `finalizedBlockLevel` field for the L2 branch; the L1 branch keeps `confirmations` (the Tenderbake attestation delta).
- **L1 transaction finality is unchanged** — `head.level - op.level >= 2` is canonical for Tenderbake (a Tezos L1 block is final after 2 attestation rounds). The check now lives behind the renamed constant `TEZOS_L1_FINALITY_BLOCKS = 2` with an inline comment explaining its scope so the next reader doesn't conflate the L1 model with the L2 model.
- **Renamed `FINALIZED_AFTER_BLOCKS` → `TEZOS_L1_FINALITY_BLOCKS`** in `shared/constants.ts`. The old name implied it applied to both runtimes; the new name pins it to L1 Tezos.
- **StatusTimeline and StatusHero copy adapted.** The L2 final step now reads "Finalized on L1" / "final on L1" / "Final on L1 · X total" — sentiment is "this L2 block is in a finalised L1 block", not "this L2 block has N successors". The L1 final step shows "attestations" instead of "confirmations" (Tenderbake terminology). The in-progress L2 chip reads "Finalizing · waiting on L1 inclusion".
- **"All / L1 / L2" segmented filter dropped from Home's Assets section.** Per Thomas's reply in the same thread: the runtime is already visible per asset row via `ChainPill`, the header filter was redundant and reinforced a two-chains mental model that Tezos X explicitly does not have. The "Assets" kicker stays; the filter and its `assetFilter` state are gone.

### Added
- **`shared/__tests__/tx-status.test.ts`** — 7 cases pinning the new L2 finality model (tx at N vs finalised N − 1 / N / N + 5; revert path) plus a regression for the unchanged L1 Tenderbake path (included / finalised at 2 attestations / failed-status pass-through).

### Compatibility
- **Wire-compatible.** No vault format change, no storage key change, no message-type change. The `TxStatus` shape gains an optional field on the `finalized` branch (`finalizedBlockLevel`) — existing consumers that only read `blockLevel` continue to work.
- **RPC requirement.** The Tezlink EVM RPC must respond to `eth_getBlockByNumber("finalized", false)`. Verified against `https://evm.previewnet.tezosx.nomadic-labs.com` on 2026-06-02 — the endpoint returns a real block whose number trails `latest` by a small margin (≈ 4 blocks observed), which matches the documented semantic.

---

## [0.10.0] — 2026-06-02

### Added
- **Custom ERC-20 token support, end-to-end.** Users can register any ERC-20 deployed on the Tezos X EVM runtime by pasting its contract address. The wallet reads `symbol()` / `decimals()` / `name()` via three `eth_call`s in `Promise.allSettled` (handles both `string` and `bytes32` encodings, falls back to short-address symbol on metadata failure, throws `NotErc20Error` when `decimals()` rejects). Up to `MAX_TOKENS_PER_ACCOUNT = 30` tokens per account, persisted in `chrome.storage.local` under `customTokens:<chainId>:<accountId>`. The token then renders identically to native assets across Home, Send, Activity.
- **`AddToken` flow at `/tokens/add`.** Three stages — paste address → confirm metadata → submit. The paste stage validates the 0x shape locally (regex), then dedupes against the active account's registry before any network call. The confirm stage shows symbol (28px / 600), name, the truncated contract address, and a seamed metadata card where **decimals carries the most visual weight** because it's the only field that can silently corrupt a balance. The flow wears the cyan EVM-runtime accent — `variant="accent-cyan"` on the primary CTA — to mark ERC-20s as L2 objects.
- **`tryAnyway` path for non-standard contracts.** When `decimals()` rejects, the user can engage Try anyway; the wallet defaults to 18 decimals and surfaces a non-dismissable yellow band above the metadata explaining the silent-failure risk in plain terms, with a Blockscout deep-link to verify the actual decimals before sending. The decimals row tags the value with an "assumed" pill in warning yellow.
- **`PEEK_CUSTOM_TOKEN` message + `peek-custom-token` use case** — read-only counterpart to `ADD_CUSTOM_TOKEN`. Runs the same validation + metadata fetch but does not write to the store. The confirm stage previews via PEEK; only the "Add {symbol}" CTA in confirm fires the actual `ADD_CUSTOM_TOKEN` write. Cancel = navigate, no cleanup. This closes the cancel-leaves-token-in-registry bug from the prototype.
- **`TokensSettings` page at `/tokens`** — list of registered tokens with per-row Remove. USDC seeds with `builtin: true` (see Changed below) and renders Remove as disabled with a tooltip.
- **`AddToken` accessible from two surfaces.** Settings → Manage tokens, and the "+" affordance on Home's assets list. Both navigate to `/tokens/add`.
- **`AssetRow`, `AssetSelector`, `assetRowVM` extracted as design-system components.** Home iterates `[xtzAsset, ...registeredTokens]` through `AssetRow`; Send's asset selector uses `AssetSelector` over the same list. Generic ERC-20 fallback icon (first-letter bubble in `--tx-surface-3` with `--tx-fg-muted`) since no logo fetch ships in 0.10.0.
- **Activity feed now decodes ERC-20 Transfer events** for every token in the per-account registry. `EvmActivityFetcher` queries Blockscout's `tokentx` endpoint and filters by the registry; each Transfer surfaces as an `ActivityTransferItem` with the right `direction` (`sent`/`received` based on `from`/`to` match), the right decimals (read from the registry entry), the right symbol, and an `id` keyed on `l2-erc20:<txHash>:<logIndex>` to dedupe across paginations. USDC transfers now appear in Activity — they did not before 0.10.0.
- **`formatTokenAmount(rawHex, decimals)` in `shared/format.ts`.** Generic helper; `mutezToXtz` and `weiToXtz` become thin wrappers. Arbitrary-decimal tokens (WXTZ at 18, future tokens at any value the contract reports) render correctly.

### Changed
- **USDC is internally re-modelled as a default-seeded ERC-20.** On every unlock and on every new account creation, `seedDefaultTokensForAccount` inserts the USDC entry (`address: 0xd77420…b0344`, `symbol: 'USDC'`, `decimals: 6`, `name: 'USD Coin'`, `builtin: true`) into the active account's registry if missing. Idempotent — re-running is a single `chrome.storage.local.get` + zero writes. Builtin tokens cannot be removed (Settings → Manage tokens renders the Remove button as disabled with a tooltip). **No user-visible change to the USDC row on Home or the USDC Send flow** — the redirection is purely internal, so the 12+ `if (asset === 'USDC')` branches across the codebase collapse to "iterate registered tokens".
- **`Asset` is now a discriminated union** over `{ kind: 'xtz' } | { kind: 'erc20', address, symbol, name, decimals, runtime: 'evm' }`. Replaces the legacy `AssetId = 'XTZ' | 'USDC'` string literal alias (removed). `BalanceFetcher.balanceOf(holder, asset: Asset)` and `SEND_TX.asset: Asset` are the load-bearing signatures. Every consumer (Home, Send, RoutingCard, InsufficientWarning, AvailableRow, StatusHero, activity-vm) now narrows on `asset.kind`.
- **The "USDC can't go to L1" rule generalises to any ERC-20.** `RoutingCard` now blocks any `Erc20Asset` destination on `l1` with the copy "{symbol} only exists on the EVM runtime — enter a 0x address" (symbol read from the asset, no longer hardcoded). Send's `erc20OnL1` predicate gates the form submission.
- **Container rebuild on token mutations.** `ADD_CUSTOM_TOKEN` and `REMOVE_CUSTOM_TOKEN` both trigger `rebuildContainer()` in the SW dispatch so `EvmActivityFetcher`'s `tokenList` closure picks up the new registry on the next poll. `PEEK_CUSTOM_TOKEN` does not rebuild — it's read-only.
- **AddToken redesign.** New 3-stage shell that **states what it wants** in one line (an 18px / 600 prompt above a 52px mono field with a Paste affordance and a live byte counter) and rebuilds the confirm screen around a typographic ramp ranked by consequence-of-error rather than reading order — symbol at 28 / 600, decimals at 14 / 600, everything else at 12. Loading between paste and confirm uses a skeleton calibrated to the confirm layout's exact rhythm (mark 48, symbol bar 96×22, name 130×12, three rows on a seamed card) so the resolved screen lands without a reflow jump. ~280 lines of new `.tx-addtoken-*` classes appended to `ui/styles.css`; no new design tokens.

### Removed
- **`formatUsdc`** from `shared/format.ts`. Every call site uses `formatTokenAmount(rawHex, asset.decimals)` with the token's actual decimals read from the registry entry.
- **`AssetId`** type alias and **`USDC_ASSET`** export from `domain/asset.ts`. Both replaced by the `Asset` discriminated union plus the seed entry in `DEFAULT_TOKENS_PER_RUNTIME`.

### Compatibility
- **No vault format change.** The `customTokens:<chainId>:<accountId>` storage key is brand new; no collision with existing keys.
- **USDC auto-seed runs at first 0.10.0 unlock per account, then is a no-op.** Vaults created on 0.9.x get USDC seeded on their next unlock; nothing is destroyed.
- **Activity cursor stays opaque.** CT2's `tokentx` cursor sits alongside the existing TzKT and Blockscout txlist cursors in the same base64 JSON blob; older clients ignore the new key.
- **Relayer pin unchanged at `^0.5.0`.** No relayer change shipped with 0.10.0 — `fetchErc20Metadata` lives in `wallet/src/shared/erc20-metadata.ts`. If a third-party SDK consumer surfaces in 0.10.x, this is a candidate for the 0.5.2 patch.
- **RPC load (informational).** With 30 registered tokens per account and Home's ~30s refresh, the wallet fires ~1 `eth_call` per second on average; Activity's Blockscout `tokentx` endpoint adds a third HTTP request per refresh cycle. Not catastrophic; if previewnet usage in 0.10.x shows rate-limit hits the natural patch is a `Multicall3`-backed batched balance read.

### Manual test plan
1. **Vault from 0.9.x.** Unlock → Home shows XTZ + USDC (USDC seeded on first unlock). Lock + unlock → USDC still there, no duplicate. Settings → Manage tokens → USDC present, Remove disabled with tooltip.
2. **Fresh install.** Welcome → Create → Tezos. Home shows XTZ + USDC. Add a second account → its registry is seeded with USDC at add-account time.
3. **Add a custom token.** Home → "+" → `/tokens/add` → paste a known ERC-20 address → confirm metadata → token appears on Home. Cancel mid-confirm (Cancel button) → token is **not** in the registry (peek-then-commit).
4. **`tryAnyway` path.** Paste a non-ERC-20 address → ErrorCard "This contract doesn't look like an ERC-20" → Try anyway → yellow non-dismissable warning band on confirm, decimals tagged "assumed" → user can verify on Blockscout via deep-link, then commit or cancel.
5. **Send a custom token.** Send → asset selector → pick the custom token → 0x destination → routing card shows "ERC-20 transfer · routed via NAC gateway"; tz1 destination → ErrorInline "{symbol} only exists on the EVM runtime".
6. **Activity decoding.** USDC transfer (Send completes) → row appears in Activity with the right symbol, decimals, runtime tag, direction. Same for the custom token added in step 3.
7. **Multi-account isolation.** Switch active account → Home shows the seeded USDC + that account's custom tokens; the custom token added on account 1 is **not** visible on account 2.
8. **Settings → Manage tokens → Remove** on the user-added token → confirmation → disappears from Home and Activity. USDC stays.
9. **Address grep sanity.** `grep -rn "formatUsdc\|AssetId\|USDC_ASSET" packages/wallet/src/` — zero hits outside test fixtures.
10. **Build.** `npm run typecheck -w @tezosx/wallet` (green), `npm run test -w @tezosx/wallet` (141 / 141), `npm run build -w @tezosx/wallet` (green, `[postbuild] manifest.json sanitized`, no `approve.html` in WAR, `frame-ancestors 'none'` preserved).

---

## [0.9.0] — 2026-05-21

### Added
- **Multi-account vaults, end-to-end.** A single vault now holds N accounts (cap: `MAX_ACCOUNTS_PER_VAULT = 50`) of any mix of Tezos and EVM kinds. From an unlocked vault the user can add a new account (Create or Import, Tezos or EVM) without re-entering the password, switch active, rename inline, and remove with a password-gated confirm. The v2 vault shape introduced in 0.7.0 (`{ version: 2, accounts, active, secrets }`) is the canonical home for all of this — no format migration was needed; previously-unused fields are now exercised.
- **AccountId scheme: UUID v4 from 0.9.0.** Previous releases used the address as the accountId (`tz1…` or `0x…`). 0.9.0 generates a fresh `crypto.randomUUID()` per account at creation, decoupling identity from address. Two accounts derived from the same key material are now deliberately allowed (a yellow Continue-anyway warning surfaces at AddAccount import time). No migration ships — the wallet is pre-launch and the previous behaviour was acceptable to break.
- **`domain/vault.ts`** (new) — pure home for `AccountSecret`, `MultiAccountVaultPayload`, the three error classes (`MaxAccountsReachedError`, `CannotRemoveLastAccountError`, `AccountNotFoundError`), and the four pure mutation functions (`addAccountToPayload`, `removeAccountFromPayload`, `setActiveOnPayload`, `renameOnPayload`). The Keyring delegates "given this payload and this request, what is the next payload" to these helpers and handles only crypto + persistence + the in-memory unlock cache.
- **`Keyring` extensions.** `addTezosAccount`, `addEvmAccount`, `removeAccount`, `setActiveAccount`, `renameAccount`, `exportSecretFor(accountId)`, `listAccounts`, `listAccountSummaries`, `getSigningKeyFor(accountId)`. The `UnlockedKeyring` shape now caches the decrypted payload + the user's password in SW memory while unlocked — that's the trust trade-off (same as MetaMask) that lets add / remove / setActive / rename run without re-prompting; evicted on `lock()` and SW death.
- **`composition/container-cache.ts`** (new) — LRU keyed by accountId, default size `CONTAINER_CACHE_SIZE = 16` (covers a power user with up to ~15 accounts swapped frequently without rebuild thrash). Used by `service-worker.ts`'s rebuild path and by the EIP-1193 handler's pinned-container lookup.
- **`composition/container-builder.ts`** (new) — `ensureContainerFor(accountId, deps)` cache-or-build helper that also attaches the `accountsChanged` / `chainChanged` / `connect` / `disconnect` provider listeners exactly once per cached container.
- **`Keyring.getSigningKeyFor`** lets the SW build a container for a non-active account on demand — used when an Approve popup resolves a pending request that was enqueued under an account the user has since switched away from.
- **5 new popup messages.** `ADD_ACCOUNT`, `REMOVE_ACCOUNT`, `SET_ACTIVE_ACCOUNT`, `RENAME_ACCOUNT`, `LIST_ACCOUNTS`. `EXPORT_SEED` grows an optional `accountId`. `PendingRequest` variants each gain `accountId` (captured at enqueue time from `keyring.getUnlocked().account.id`).
- **Model A dApp semantics (MetaMask-style).** The active account is wallet-wide. `setActiveAccount` and `removeAccount` (of the active) broadcast EIP-1193 `accountsChanged([<new 0x>])` to every connected origin via the existing `broadcastEvent` helper. Connected dApps re-resolve who they're talking to. The wallet does NOT support sticky-per-origin (Model B) in 0.9.0 — it was rejected as premature for the previewnet phase.
- **Pending approval pinning.** A pending dApp approval enqueued under account A survives a switch to account B; the Approve popup signs through A's container regardless of the currently-active selector. If A has been removed between enqueue and resolution, the popup renders a danger ErrorCard and offers a Close-only action bar (the EIP-1193 caller receives `code 4001`).
- **`AccountHeader`** (new) — single component that combines the active account display + chevron-to-open-switcher, replacing the previous identicon/label-duplicating chip-above-card layout. Tezos accounts surface both the tz1 and the EVM alias side-by-side; EVM-native accounts surface only the 0x. Renders an inline "+" affordance when the vault holds exactly one account so AddAccount is reachable without entering the switcher first.
- **`AccountSwitcher` popover.** Lists every account with the active row hoisted on top and the rest sorted by `createdAt` ASC. Tap a row to switch; settings → rename modal; ✕ → remove modal (the last-account button is disabled with a tooltip). An "Add account" footer row links to the new `/accounts/add` route. Closes on outside-click / Escape. A `mode: 'pick'` variant is reused by Settings → Reveal Secret as a read-only account picker.
- **`/accounts/add` route.** A 4-stage flow — kind picker (Tezos / EVM) → source picker (Create / Import) → input (blurred-reveal for fresh; mnemonic+edsk toggle or hex privkey for import) → optional label + Confirm. Confirm rounds through `ADD_ACCOUNT` then `SET_ACTIVE_ACCOUNT` and navigates Home. Import paths derive the address client-side and surface a yellow Continue-anyway warning when the derived address collides with an existing entry.
- **`AccountChip`** — compact "Signing with: <label> · 0x…" chip rendered at the top of every Approve popup view. When the currently-active account differs from the pinned one a muted footnote reminds the user they don't need to switch — approving signs with the pinned account regardless.
- **`RenameModal` / `RemoveAccountModal`** — single text input rename (cap `MAX_LABEL_LENGTH = 32`, empty string clears the label) and password-gated remove with a back-up reminder and a last-account guard.
- **Settings → Reveal Secret picker.** When the vault holds ≥ 2 accounts, the Reveal flow now opens an inline account picker (read-only `AccountSwitcher` in pick mode) before the password gate. Single-account vaults skip straight to the existing password flow.
- **Settings → Add account.** Top-level link making `/accounts/add` discoverable without entering the switcher (relevant for single-account vaults).
- **Connections page filter.** A new top-of-page segmented control ("All accounts" / "This account") appears when ≥ 2 accounts exist. Each session row gains an account meta line — "<label> · <truncated addr>" — derived from `state.accounts` at render time. Sessions whose accountId no longer maps to a known account are flagged "Removed account" in danger colour. The filter pref persists in `chrome.storage.local` under `connectionsViewFilter`.

### Changed
- **AccountId values.** Existing 0.7.x / 0.8.x vault accounts had `id === address`; from 0.9.0 every newly created or imported account gets a `crypto.randomUUID()`. No migration ships — the wallet is pre-launch.
- **`VaultStateUnlocked` grows `accounts: AccountSummary[]`** so the popup can render a switcher without an extra round-trip.
- **`getState`** projects the full account summary list (sorted by `createdAt` ASC) alongside the active account's existing fields. The popup consumes `accounts` for the switcher and `accountId / tz1 / evmAlias / address` for the active surface.
- **`unlock-vault.ts`** is now a one-liner — V1 → V2 and session-remap branches were removed (no migration in 0.9.0).
- **`Account` shape** gains `createdAt: number` (ms epoch, captured at creation). The view models use it to derive the "Account N" fallback label and to sort the switcher list.
- **Settings → About** now reads `Wallet v0.9.0 · Relayer v0.5.1`.
- **`shared/constants.ts`** gains `MAX_ACCOUNTS_PER_VAULT = 50`, `MAX_LABEL_LENGTH = 32`, `CONTAINER_CACHE_SIZE = 16`.

### Compatibility
- **No relayer change required.** Wallet 0.9.0 builds against `@tezosx/relayer ^0.5.0` (resolves to whatever's latest in the 0.5.x line) — `ITezosWalletClient` is unchanged.
- **Pre-launch break.** Vaults created on 0.7.x / 0.8.x do not migrate. The wallet has no real users yet (previewnet phase only).
- **Additive elsewhere.** Existing dApp connection semantics are unchanged from MetaMask's perspective; `accountsChanged` broadcasts now fire on user-initiated active-account switches in addition to the SDK-initiated cases.

### Manual test plan (relevant scenarios)
1. With a single account in the vault: AccountHeader shows no chevron; the inline "+" opens `/accounts/add`. Switcher is unreachable from Home. Settings → Add account also reaches `/accounts/add`.
2. AddAccount → Tezos → Create: 12-word mnemonic appears blurred → "Tap to reveal" → "I've saved it" gate. After Confirm, the new account is active; Home re-renders with the new identicon and alias.
3. AddAccount → Tezos → Import → mnemonic: paste a valid 12-word mnemonic; the new account appears with the correct tz1. Active flips to it.
4. AddAccount → Tezos → Import → edsk: paste a valid edsk; same as above.
5. AddAccount → EVM → Create: 32-byte private key appears blurred → reveal → ack → optional label → Confirm. The new EVM account is active.
6. AddAccount → EVM → Import → privkey: paste a 64-character hex key (with or without `0x` prefix); the new EVM account appears with the correct address.
7. AddAccount duplicate-import: re-enter the secret of an existing account. A yellow warning appears with the existing label and a Continue-anyway checkbox. Continuing creates a deliberate duplicate (UUID v4 ids allow it).
8. With two+ accounts: AccountHeader shows the chevron. Tap → switcher opens with the active row hoisted on top. Tap a non-active row → switch happens; if a dApp tab is open with a connected origin, the dApp's `window.ethereum` fires `accountsChanged` (visible in DevTools console of that tab).
9. Rename: open the switcher, tap settings on any row → modal → type "Trading" → save → the chip and the switcher row now show "Trading".
10. Remove (non-active): switcher → ✕ → password gate → confirm → account disappears.
11. Remove (active): same flow; the keyring auto-switches to the next createdAt-ASC peer BEFORE the deletion (atomic single-write); `accountsChanged` fires; Home re-renders with the new active.
12. Remove (last): the ✕ button is disabled (tooltip "Cannot remove the last account").
13. dApp approval pinning: connect dApp X with account A; immediately switch active to B; dApp X sends `eth_sendTransaction`. The Approve popup opens with an AccountChip pinned to A and a muted footnote ("you don't need to switch — approving signs with this account regardless"). Approving signs through A's container; B is unaffected.
14. Remove an account with a pending approval: the next time the Approve popup queries `GET_PENDING`, it auto-rejects (code 4001) and renders a danger card with a Close-only action bar.
15. Settings → Reveal Secret with two+ accounts: picker shows all; pick an account; password gate; reveal succeeds for the picked account. Back button returns to the picker.
16. Connections page with two accounts: connect dApp X with A, switch to B, connect dApp Y with B. The filter shows "All accounts" by default — both rows visible with their accountId meta. Toggle to "This account" with B active → only Y is shown. Reload the popup (lock + unlock) → filter selection persists.
17. Container cache: from the SW DevTools console, `chrome.runtime.sendMessage({ type: 'SET_ACTIVE_ACCOUNT', accountId: '<id>' })` repeatedly between two accounts. Each switch < 50 ms after the first build (cached).

---

## [0.8.0] — 2026-05-19

### Added
- **Functional Activity tab.** Replaces the 37-line stub. Merges TzKT (tz1 L1 operations) and Blockscout (EVM transactions) into one chronological feed, dedupes cross-runtime `tz1 → 0x` ops via `@tezosx/relayer/tezos`'s `l1OpHashToEvmHash`, overlays the wallet's in-flight pending L1→L2 ops surfaced by `RelayerProvider.listPendingOps` (added in `@tezosx/relayer` 0.5.1), and renders each row through a new `ActivityRowVM` projection. Cross-runtime rows show both runtime pills and a secondary explorer affordance. AliasForwarder self-transfers (CLAUDE.md §10 — XTZ sent to a tz1's own EVM alias is forwarded back to the tz1) are filtered out of the default feed; a `filter.includeAliasSelfTransfers: true` knob exposes them for debugging.
- **Direction segmented control + Runtime popover.** Direction (All / Sent / Received) sits in a `.tx-seg` pill; the runtime filter (Any / Michelson / EVM / Cross-runtime) lives behind a 30 px icon button that opens a popover with coloured swatches and an active-filter chip with an × to clear. Filtering is client-side over the merged window.
- **"N new activity" pill.** Auto-refresh polls every `ACTIVITY_AUTO_REFRESH_MS` (30 s by default) but **does not** overwrite the rendered list. Fresh items are held in a pending buffer; a Twitter-style pill at the top of the list invites the user to merge them in at their own pace. Manual refresh button in the page header forces an immediate in-place merge and clears the buffer.
- **Cursor-based load-more.** Opaque per-source cursors aggregated into a single base64 blob; the UI passes the string through verbatim. The first window fetches `ACTIVITY_PAGE_SIZE = 25` items; the "Load more" button at the bottom appends the next window.
- **Vitest test runner.** First automated test suite in the wallet workspace. 44 unit tests cover the activity cursor round-trip, the `formatError` sanity surface, both adapters against checked-in fixtures, the precompile-input ABI decoder, the `listActivity` merge / dedup / sort / filter algorithm (10 cases + one EVM-only-account case), and the `activityRowVM` projection. New `npm run test -w @tezosx/wallet` and `test:watch` scripts.
- **`domain/activity.ts`** — discriminated `ActivityItem` union over `transfer | contract-call | signature | unknown`, `ActivityRuntime`, `ActivityStatus`, `ActivityDirection`, `ActivityFilter`, `ActivityPage`, an opaque `ActivityCursor` branded string, and the `encodeActivityCursor` / `decodeActivityCursor` helpers.
- **`ports/activity-fetcher.ts`** (replaces the W7 placeholder) — single-method `ActivityFetcher` interface taking `{ holder, limit, cursor? }`.
- **`adapters/tezos/tezos-activity-fetcher.ts`** — TzKT `v1/accounts/{addr}/operations` with `lastId` cursor pagination. Recognises native transfers, NAC gateway calls (default + call_evm entrypoints to `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`), and other contract calls. Cross-runtime candidates carry `crossRuntime.evmEffectStatus: 'unresolved'` until the use case finds their Blockscout mirror. Row identity is keyed on TzKT's stable native integer `id` (CLAUDE.md flag: TzKT groups internal ops under one hash, so the integer id is more reliable).
- **`adapters/evm/evm-activity-fetcher.ts`** — Blockscout `account/txlist` with `page + offset` cursor. Recognises native EVM transfers, calls to the NAC precompile at `0xff…007` (flagged as `runtime: 'cross-runtime'`, `direction: 'evm-to-tezos'`, destination tz1 decoded from the ABI-encoded input via the new `decodePrecompileTransferInput` helper), and generic EVM contract calls. Rate-limit envelopes (`status: '0'`, `message: 'NOTOK'`) are surfaced as throws so the use case can downgrade staleness rather than blowing away the list.
- **`use-cases/list-activity.ts`** — pure `(req, deps)` function calling the wired adapters in parallel via `Promise.allSettled`, merging cross-runtime correlations through `l1OpHashToEvmHash`, overlaying pending L1→L2 ops, sorting by timestamp descending, applying filters + AliasForwarder default-drop, slicing to `limit`, and returning `{ items, cursor, staleness, errors? }`. `staleness` reports `'fresh'`, `'partial'` (one source failed), or `'cached-only'` (both failed) so the UI can render the right toast variant without throwing.
- **`composition/container.ts`** — extended with `activitySources: { tezos?, evm, pendingOps? }`. Tezos accounts get both adapters plus a closure over `RelayerProvider.listPendingOps`; EVM-native accounts get only the EVM adapter (the Michelson alias of an EVM account is a KT1 with no user-meaningful history).
- **`shared/messages.ts`** — new `LIST_ACTIVITY` popup message (`{ cursor?, limit?, filter? }`) returning an `ActivityPage`. `ActivityFilter` and `ActivityPage` re-exported from `domain/activity` for popup-side type consumption.
- **`ui/view-models/activity-vm.ts`** — `activityRowVM(item, nowMs?)` projects an `ActivityItem` into a structured `ActivityRowVM` (`verb`, `arrow`, `counterparty`, `runtimeBadge`, `runtimeTag`, `amount {value, sign}`, `status`, `ago`, `dayGroup`, primary + optional secondary explorer URLs). The runtime tag disambiguates cross-runtime direction (`Michelson → EVM` vs `EVM → Michelson`); `ago` adopts context-aware copy (`Pending · 22s`, `Failed`, `4s ago`, `yesterday`, `3d ago`); `dayGroup` buckets the row into Today / Yesterday / Earlier for the section heads.
- **`ui/tx/ActivityRow.tsx`** — redesign per the Claude Design handoff. Three-column grid (36 px identicon · `1fr` body · auto amount). The identicon's outer ring carries the runtime (`tx-activity-ident.l1` purple, `.l2` cyan, `.cross` purple→cyan gradient); pending becomes a conic-spinner in `--tx-warning`, failed flips the ring to `--tx-danger`. The body shows `verb · arrow · mono-address` on row 1 and `runtime-tag · ago` on row 2 (with `pending-tag` / `failed-tag` colour swaps); the amount column color-codes by sign and status and surfaces one or two compact explorer chevrons inline (none when pending). Glyphs are picked per kind (transfer ↑↓, contract-call, signature, failed ✕, unknown ○). Inline pills are gone — the ring is the runtime carrier.
- **`ui/tx/ActivityFilters.tsx`** — segmented direction control + 30 px popover trigger. The popover hosts the four runtime options with coloured swatches; an inline `tx-filter-chip` summarises the active runtime when set, with an × to clear. Click-outside and Escape close the popover.
- **`ui/tx/ActivityNewPill.tsx`** (new) — sticky pulsing chip that floats above the list when the auto-refresh poll has discovered fresh items; replaces the previous flat purple plate. Renders nothing when the pending buffer is empty.
- **`ui/tx/ActivityStaleBand.tsx`** (new) — soft amber slot under the TopBar surfacing partial-fetch / TzKT-lag conditions, dismissible. Shows automatically when `ActivityPage.staleness` is `'partial'` or `'cached-only'`.
- **Day grouping.** The page renders `Today` / `Yesterday` / `Earlier` section heads (`.tx-activity-group-head`) so a long feed stays scannable. The load-more footer (`.tx-activity-foot`) replaces the older `tx-btn ghost` button and folds the spinner into the same surface as the "Show older activity" / "— end —" copy.
- **CSS tokens.** `wallet/src/ui/styles.css` gains the full activity surface — `.tx-activity` (row grid), `.tx-activity-ident` (with `.l1` / `.l2` / `.cross` / `.pending` / `.failed` variants), `.tx-seg`, `.tx-filter-btn` / `.tx-filter-pop` / `.tx-filter-chip` / `.tx-filter-chip-swatch`, `.tx-new-pill` (with ping animation), `.tx-status-band`, `.tx-activity-group-head`, `.tx-activity-foot`, `.tx-activity-empty`. No new design tokens — everything reuses the existing `--tx-*` family.

### Changed
- **Settings → About** now reads `Wallet v0.8.0 · Relayer v0.5.1`.
- **CLAUDE.md §12** loses the "no automated test suite yet" line.
- **`shared/constants.ts`** gains `BLOCKSCOUT_API_BASE`, `ACTIVITY_PAGE_SIZE`, `ACTIVITY_AUTO_REFRESH_MS`. Network-and-protocol constants stay where wallet-level constants already live (no new `composition/constants.ts`).
- **Pins `@tezosx/relayer` to `^0.5.0`** (resolves to `0.5.1` on next install to pick up `RelayerProvider.listPendingOps`).

### Compatibility
- Additive across the board. No vault format change, no session-store change, no message-type breakage, no UI route added or removed. Existing 0.7.0 vaults open unchanged.
- The activity feed lives only in service-worker memory; SW eviction or popup unmount drops the rendered list, and the next refresh rebuilds it from TzKT + Blockscout + `listPendingOps`. A proper persistent cache is a 0.9.x problem.

### Manual test plan (relevant scenarios)
1. On a Tezos account with prior previewnet activity, open the Activity tab → mixed L1 and cross-runtime rows render sorted desc by timestamp. Filter "Sent" → only outbound items. Click an L1 row → tzkt opens.
2. Click a cross-runtime row's primary link → tzkt opens; click the secondary affordance → Blockscout opens with the kernel-synthesized hash.
3. On the same account, broadcast a tz1 → 0x send. Navigate to Activity within ~2 s. The pending op surfaces at the top with the `dots` status icon. After ~30 s and a kernel-mirror sync, the row updates to `confirmed` with both side-links populated.
4. On an EVM-native account, the Activity feed renders only EVM-side rows (no TzKT-source items). A 0x → tz1 precompile call surfaces as `cross-runtime` with the destination tz1 decoded from the input.
5. With Activity open, fund the active account from the faucet. After ≤30 s the "N new activity · refresh" pill appears. Scroll position preserved; the rendered list unchanged. Click the pill → new row prepends, pill disappears.
6. Click the manual refresh icon while the pill is showing → pending buffer merges immediately; pill clears.
7. Take the network down briefly; the existing list stays visible, a danger toast appears with retry. Restore the network; click retry → fresh data loads.
8. **W7b-1 empirical step:** broadcast a `0x → tz1` from an EVM-native account, then check the destination tz1's TzKT history. Record whether a kernel-mirror op appears for that L1 op hash. If so, capture the response shape under `adapters/tezos/__fixtures__/tzkt-evm-to-tezos-mirror.json` and extend `list-activity.test.ts` case #11 with a dedup branch that drops the mirror.

---

## [0.7.0] — 2026-05-15

### Added
- **EVM-native accounts, end-to-end.** A vault now optionally holds a secp256k1 account that signs EVM transactions directly. Welcome ships a binary runtime selector (Michelson vs. EVM) gating Create and Import; Create generates a random 32-byte private key and reveals it with the same blur / "I've saved it" backup gates the Tezos flow uses; Import accepts a hex private key (with or without the `0x` prefix). The selected kind is carried forward via `?kind=tezos|evm` URL params. Multi-account UI (switcher, add-account at runtime) is deferred to 0.8.0 — the vault format is forward-compatible but the create/import flow only runs at onboarding and produces exactly one account.
- **Cross-runtime and same-runtime sends from EVM accounts.** `decideRoute` now resolves the full 4-way matrix of source kind × destination address: `0x → 0x` is signed and broadcast directly as an EIP-1559 type-0x2 tx via the new `EvmProvider`; `0x → tz1 / KT1` is built from `@tezosx/relayer/evm`'s `buildCrossRuntimeTx`, signed with the user's secp256k1 key, and broadcast through the NAC precompile at `0xff00000000000000000000000000000000000007`. The Send page's `RoutingCard` now emits the correct copy for all four combinations (Same-runtime Tezos L1 / Same-runtime Tezos L2 / Cross-runtime via NAC gateway / Cross-runtime via NAC precompile). USDC source-from-EVM is intentionally out of scope for this release — the asset selector is disabled with a "Soon" tooltip when an EVM account is active.
- **`personal_sign` and `eth_signTypedData_v4` gating.** dApp signature requests now route through a new `SignatureView` in the approval popup with the message decoded as UTF-8 when possible (and the raw hex shown below). Previously these methods bypassed the approval queue.
- **EVM-aware view model.** New `ui/view-models/account-card-vm.ts` (`accountCardVM`, `signingSourceAddress`) unifies the presentation of Tezos and EVM accounts. `AccountCard` gained a `variant="vm"` rendering — single-address layout for EVM accounts, dual L1/L2 layout for Tezos. Home, Settings, Send, and Receive all consume the VM. Receive drops the L1/L2 toggle when the active account is EVM. Settings hides the tzkt explorer row for EVM accounts and surfaces the raw hex private key under "Reveal secret".
- **In-place vault format upgrade** (V1 → V2). Existing 0.6.0 installs continue to open with the user's password; on first unlock after install, the keyring rewrites the encrypted payload as `{ version: 2, accounts: Account[], active: AccountId, secrets: Record<AccountId, AccountSecret> }`. The same `unlockVault` use case eagerly migrates every stored dApp session to carry the freshly-minted `accountId` alongside the existing `tz1Address`, so no session is orphaned after the upgrade.
- **EVM signing primitives** under `src/shared/evm-signing/`: a hand-rolled RLP encoder, EIP-1559 signer (`signTransaction1559`), EIP-191 personal-message signer (`signPersonalMessage`), keccak256, hex/bytes helpers, secp256k1 key derivation (`deriveEvmAccount` with EIP-55 checksum) and a random key generator. Built on `@noble/curves/secp256k1` and `@noble/hashes/sha3` — viem and ethers are deliberately not in the wallet's dependency tree.

### Changed
- **L2 finality is now L1-anchored.** The Send timeline previously waited `FINALIZED_AFTER_BLOCKS = 2` additional L2 blocks beyond inclusion before flipping to "Finalized" — a heuristic ported from Ethereum mainnet that doesn't apply on Tezos X, where every L2 block is produced from an L1 commitment and inherits L1 finality rather than building its own through block depth. By the time `eth_getTransactionReceipt` returns a non-null receipt the L2 block has already been committed on L1, so the wait was pure latency. `pollL2` now returns `{ stage: 'finalized', blockLevel, confirmations: 0 }` directly on receipt; the timeline renders `L1-anchored` instead of a confirmation count. L1 ops keep the `≥ 2` L1-confirmation rule (L1 finality genuinely is a function of block depth on Tezos).
- **Architecture refactor: clean ports-and-adapters layering** across the wallet. `lib/` is split into:
  - `domain/` — pure types and predicates: `Account` (discriminated union over Tezos/EVM), `TransferRoute` / `decideRoute`, `TxStatus`, `Approval`, `FormattedError`, validators, `RuntimeId`.
  - `ports/` — interfaces describing what use cases need from the outside world: `SignerPort` (discriminated union `TezosSignerPort | EvmSignerPort`), `ProviderPort` (extends `EIP1193Provider` with `resolveSyntheticHash`), `VaultStore`, `SessionStore`, `BalanceFetcher`, `NotificationPort`.
  - `use-cases/` — pure `(req, deps) => Result` functions: `create-account`, `import-account`, `unlock-vault`, `lock-vault`, `send-transfer`, `resolve-tx`, `get-state`, `list-sessions`, `disconnect-origin`, `list-pending`, `get-pending-approval`, `resolve-pending-approval`, `export-secret`.
  - `adapters/tezos/` — `TezosSigner` (Taquito-backed) and `TezosBalanceFetcher`. `adapters/evm/` — `EvmSigner`, `EvmProvider` (direct Tezlink JSON-RPC client), `EvmBalanceFetcher`, `nac-precompile-builder` (thin wrapper around `@tezosx/relayer/evm`). `adapters/chrome/` — `ChromeVaultStore`, `ChromeSessionStore`, `ChromeNotificationPort`.
  - `composition/container.ts` — single factory that wires the right adapters to the active account's kind. The service worker calls `buildContainer({ kind, ... })` on every unlock and the use cases receive a fully-wired `Container` as their `deps.container`.
  - `composition/sw-wiring.ts` — the SW message router. The service worker entrypoint shrinks to ~95 lines, delegating to `dispatch()` which exhaustively switches on message type.
- **Vault payload format** (decrypted plaintext) is now `{ version: 2, accounts: Account[], active: AccountId, secrets: Record<AccountId, AccountSecret> }`. `AccountSecret` is a discriminated union of `{ kind: 'mnemonic' | 'edsk' | 'evm-pk', value: string }`. The on-disk `EncryptedVault` shape (AES-GCM ciphertext + iv + salt + iterations) is unchanged.
- **`StoredSession`** gains an optional `accountId` field, populated for all newly-created sessions and back-filled in the migration described above. The `tz1Address` field is preserved.
- **Settings → About** now reads "Wallet v0.7.0 · Relayer v0.5.0".
- **Pins `@tezosx/relayer` to `^0.5.0`** to consume `@tezosx/relayer/evm` (precompile builders, `buildCrossRuntimeTx`) and `@tezosx/relayer/types`.

### Fixed
- **`bytesToHex` was missing the `0x` prefix** but `randomEvmPrivateKey` assumed it had one and was slicing the first byte off. This produced 62-character private keys that failed `normaliseEvmPrivateKey`'s `/^[0-9a-fA-F]{64}$/` regex, which threw synchronously at the EVM Create page's mount and rendered a blank screen. Fixed in `derive-evm-account.ts`: `randomEvmPrivateKey` no longer slices, `publicKey` is explicitly `0x`-prefixed, and `toChecksumAddress` reads `bytesToHex(addrBytes)` directly.
- **`decideRoute` was hardcoded to `sourceChain: 'michelson'`** regardless of the active account kind. Cross-runtime sends from an EVM account therefore routed through the `nac-gateway-l1` branch of `sendTransfer`, which only the Tezos signer handles, and the EVM branch fell through to the catch-all `throw "Unsupported route"`. `decideRoute` now branches on `account.kind`.
- **EIP-1559 fee fields were hardcoded to `0n`** in the cross-runtime EVM-to-tz1 path. Tezlink's `baseFeePerGas` is 1 gwei and the kernel won't include a tx whose `maxFeePerGas < baseFee`, so the wallet broadcast a signature-valid hash that never landed in a block (`eth_getTransactionByHash` returned `null` indefinitely). Both `EvmProvider.handleSendTransaction` and the cross-runtime path now fetch `eth_gasPrice` and use `2 × gasPrice` as the safety buffer.
- **`@noble/curves` v2 `sign(msg, sk, opts)` defaults `prehash: true`** (the source-code default disagrees with the docs but the runtime behaviour matches the docs). With no explicit override the wallet was applying `sha256` to its `keccak256(unsignedTx)` input before signing, producing a signature valid for `sha256(keccak256(...))` that recovered, via standard ECDSA recovery, to a *different* address than the one the wallet displayed. The chain refused to credit gas against that synthetic sender → mempool drop. Fixed by passing `prehash: false` explicitly in `signTransaction1559` and `signPersonalMessage`. Verified by signing a known key, RLP-encoding the tx, and recovering the sender with viem — now matches the derived address bit-for-bit.
- **Noble v2's `sign({ format: 'recovered' })` returns a 65-byte `Uint8Array`**, not a structured `Signature` object (the TypeScript overload misled us into treating `sig.recovery / sig.r / sig.s` as accessors, but at runtime those were undefined and `BigInt(undefined)` threw "Cannot convert undefined to a BigInt" at the SW boundary). The signing primitives now parse the bytes directly using the documented layout `[recovery(1), r(32), s(32)]`.

### Compatibility
- **0.6.0 vaults open unchanged.** The first unlock detects the legacy V1 payload, upgrades to V2 atomically (single `chrome.storage.local.set`), and migrates any persisted dApp sessions to carry `accountId`. Lock/unlock idempotency holds — a second unlock skips the upgrade detection path.
- **dApp-facing `window.ethereum` surface is unchanged.** Same EIP-1193 method set, same response shapes. Internally the implementation forks on the active account's kind; the dApp sees a consistent provider.
- **Pinned to `@tezosx/relayer ^0.5.0`.** The relayer's per-file legacy paths (`./provider`, `./wallet-client`, `./gateway`, `./constants`, `./utils/derive`) still resolve via re-exports, so the wallet's existing imports continue to work. New EVM consumer code imports from `@tezosx/relayer/evm` and `@tezosx/relayer/types`.

---

## [0.6.0] — 2026-05-07

### Added
- **Toolbar badge for pending dApp requests.** When a dApp triggers `eth_requestAccounts` or `eth_sendTransaction`, the extension icon now shows a counter so the user doesn't miss an approval if they switched tabs. Cleared on approve/reject, on lock, and when the user closes the approval window manually (which is now correctly treated as a reject — was a latent bug previously). New `lib/badge.ts` wrapper around `chrome.action`; the colour is centralised in `BADGE_BG_COLOR` (`var(--tx-purple)` ≈ `#a78bfa`).
- **Live status timeline on the Send "Done" screen.** Replaces the single check + hash with a 3-step indicator (Broadcasted → Included → Finalized) that polls TzKT for L1 native transfers (`api.previewnet.tezosx.tzkt.io`) and the Tezlink EVM JSON-RPC for cross-runtime transfers, updating every 2 s (then 5 s once included) until the operation reaches finality (`FINALIZED_AFTER_BLOCKS = 2`). Shows the block number once included, the confirmation count once finalized, and a direct explorer link. Falls back to "Status unavailable" with a manual explorer link if polling fails for longer than `TX_POLL_TIMEOUT_MS` (2 minutes); flips a red "failed" dot if the op reverts.

### Fixed
- **Closing the approval window manually now resolves correctly.** The wallet listens to `chrome.windows.onRemoved` and rejects the matching pending request with code `4001`. Previously the request stayed in the queue forever, the dApp's promise hung, and the badge would have stuck on a non-zero count.

### Internal
- New `lib/poller.ts` — generic poll-with-cancel engine (`startPoller({ fetch, onUpdate, isDone, intervalMs, timeoutMs, onTimeout })`) decoupled from any specific domain. Reusable later for balance refresh, activity feed, etc.
- New `lib/tx-status.ts` — `TxStatus` discriminated union and L1 (TzKT) / L2 (EVM RPC) fetchers built on top of the generic engine.
- New `ui/tx/StatusTimeline.tsx` — pure presentation component, no side effects, takes a `TxStatus` and renders it.
- `ApprovalQueue` now exposes a read-only `entries()` iterator so the SW can map a closed approval window back to its request id without breaching the encapsulation of its internal `Map`.
- `clearPendingBadge()` is called both at SW boot and inside the `onInstalled` listener so a stale badge can never outlive the queue (Chrome persists the badge across SW restarts).

### Compatibility
- No wire-protocol change.

---

## [0.5.0] — 2026-05-07

### Changed
- **Unified error display across the wallet.** Every surface that used a raw red `<p>` now renders the same `ErrorCard` / `ErrorInline` / danger `Toast` / `FatalScreen` family and routes the underlying error through a new `formatError(err, ctx?)` dispatcher (`src/lib/errors.ts`). The dispatcher recognises:
  - **Tezos RPC** — `contract.balance_too_low`, `contract.counter_in_the_past`, `gas_exhausted.operation`, `tezlink_error`, `evm_node.dev.insufficient_fees` (existing, now under the unified roof).
  - **Auth** — `invalid-mnemonic`, `invalid-edsk`, `password-too-short`, `wrong-password`, `no-vault` — recognised by canonical thrown messages.
  - **EIP-1193** — `4001`, `4100`, `4200`, `-32601`, `-32602`, `-32603` — recognised by the numeric `code` on the `Error` (preserved end-to-end now that `sendPopupRequest` throws a typed `Error & { code }` instead of a plain string).
  - **Network** — `rpc-unreachable`, `rpc-timeout`, `rpc-5xx` — recognised by fetch / abort / 5xx patterns.
  - **App-level** — `sw-unreachable`, `iframe-blocked` — built manually with `makeError(key)`.
- **New components:**
  - `tx/ErrorInline.tsx` — compact 12 px-icon variant for form-validation errors (Unlock password, Create / Import field validation, Settings reveal modal). Title-only or title + detail. No raw payload, no copy.
  - `tx/FatalScreen.tsx` — full-popup centred reset (icon block · title · detail · `Reload wallet` + optional `Contact support` · machine code footer). Replaces the bare red `<p>` that App.tsx used when the SW couldn't be reached.
  - `tx/Toast.tsx` extended with a `danger` variant + new `errorToast({ message, secondary, retry, sticky })` API. The success `toast(string)` API is unchanged. The danger toast can be transient (5 s + 2 px progress hairline) or sticky (no timer, close button); both support a Retry action.
- **Surfaces converted:** `Approve` (ErrorCard for `stage='error'` and the iframe-blocked guard via `makeError('iframe-blocked')`), `Home` (single danger toast with Retry instead of two stacked inline messages on simultaneous fetch failures), `Unlock` / `Create` / `Import` / `Settings` reveal modal (ErrorInline under the relevant field), `App` (FatalScreen on SW unreachable). All seven surfaces now store the raw error (`useState<unknown>`) and only format at render time, so the `code` field survives.

### Removed
- `src/lib/tezos-errors.ts` — collapsed into `src/lib/errors.ts` (broader scope; the old export `formatTezosError` is gone too — call `formatError` directly).

### Added
- **Side panel mode (Chrome 114+).** Click the new sidebar icon in the Home top bar to dock the wallet UI as a persistent panel on the right edge of the browser, MetaMask-style. The popup mode remains the default click behavior of the toolbar icon — the side panel is opt-in per session. Implementation: `sidePanel` permission + `side_panel.default_path: "popup.html?mode=side"` in the manifest, `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` at SW boot, and a click-handler call to `chrome.sidePanel.open({ windowId })` directly in the popup (must run inside the user-gesture frame — round-trips to the SW lose the gesture and Chrome rejects). The bouton is hidden when already in the side panel via the `?mode=side` query param. `.tx-popup` adapted from `360×600` fixed to `100vw × 100vh` with `min-width / min-height` so the popup keeps its size while the panel can stretch.

### Changed
- **Send page surfaces balance, warns on insufficient funds, and parses errors.** Three coordinated UX upgrades on the Send flow:
  1. The form stage now shows an "Available · X.XXXXXX XTZ/USDC" row directly under the amount input, with a `MAX` pill that pre-fills the input (XTZ keeps a 0.01 reserve for fees; USDC fills the full balance). The row turns soft red with an alert glyph when the typed amount exceeds the balance — no flash, just a 220 ms colour transition. Loading state shows a skeleton.
  2. The review stage inserts a "Likely insufficient funds" banner between the review card and the CTA when the request exceeds the cached balance. The CTA stays primary — explicit user override is allowed (the kernel may settle from a balance the RPC hasn't refreshed).
  3. The error display, previously a raw HTTP 500 dump, is now parsed by a new `lib/tezos-errors.ts` helper: `formatTezosError` recognises `contract.balance_too_low`, `contract.counter_in_the_past`, `gas_exhausted.operation`, `tezlink_error`, and `evm_node.dev.insufficient_fees`, surfacing a friendly title + detail (e.g. "Insufficient funds — Tried to spend 0.000334 ꜩ but balance is 0 ꜩ"). Raw RPC payload stays available behind a "Show technical details" disclosure with a single-line scrollable mono window and a Copy action. Unknown error IDs fall back to "Operation rejected ({id})"; non-Tezos errors fall back to a truncated message.
- New components: `tx/AvailableRow.tsx`, `tx/InsufficientWarning.tsx`, `tx/ErrorCard.tsx`. Visual specs followed from the Claude Design handoff bundle (3 micro-elements at 360 px popup width, with token/sizing/type/interaction specs).

### Compatibility
- No wire-protocol change. Manifest now declares `sidePanel` permission — re-install / reload required for the new permission to take effect.

---

## [0.4.3] — 2026-05-06

### Fixed
- **Residual `insufficient_fees` after 0.4.2.** Taquito's `est.opSize` excludes the 64-byte signature; the kernel charges on the signed op → ≈216 mutez under-payment (matches `1137 → 1354`). Added a 96-byte margin to `opSize`.
- **Retry-on-`required` parser** rewritten to handle the real error format (`"required":"0.001354"` — JSON, decimal tez), so the fallback finally fires when needed.

### Security
- **Fixed clickjacking vector on the approval popup.** `approve.html` was declared as `web_accessible_resources` with `matches: ["<all_urls>"]`, which let any website embed the approval page in an iframe and exploit a clickjacked approval flow against an unlocked wallet (a malicious page could trigger a legitimate `eth_sendTransaction` to obtain a valid `requestId`, then iframe `chrome-extension://<id>/approve.html?requestId=…` and trick the user into clicking "Approve" through opacity/positioning tricks). Three independent layers of defense, any one of which closes the attack:
  1. Removed the `web_accessible_resources` declaration entirely from `manifest.json`. The service worker opens `approve.html` via `chrome.windows.create({ url: chrome.runtime.getURL('approve.html') })`, which works for any extension page regardless of web-accessibility — so this is a no-cost removal.
  2. Added `Content-Security-Policy: frame-ancestors 'none'` as a `<meta http-equiv>` in `approve.html`. Defense-in-depth: even if the resource is later re-exposed by accident, the browser refuses to embed.
  3. Added a runtime `if (window.top !== window) { window.close(); }` guard at the top of `approve-main.tsx`, *before* React even mounts. Stricter than an in-component guard would be, since the React tree never gets created in an iframe context.
- **Explicit `sender.id === chrome.runtime.id` check** in the `GET_PENDING` / `RESOLVE_PENDING` branch of the SW message router. Implicit because `chrome.runtime.onMessage` already filters by extension id, but made explicit so the access boundary is visible at the call site.
- Reported responsibly by **Eugene Yakovchuk** — thanks.

### Added
- **"Experimental" banner across the wallet UI.** A persistent, non-dismissible banner now sits at the top of every page (popup home + all routes, and the approval popup) reminding the user that this is a pre-release POC and not to use it with mainnet funds. New `tx/ExperimentalBanner.tsx` component; mounted in `App.tsx` and `approve-main.tsx`. Mirrors the same banner on the documentation site.

### Internals
- `.tx-approval` no longer hardcodes `height: 100vh` — uses `flex: 1; min-height: 0` instead so it shrinks naturally under the banner inside the approve-popup flex column.

### Compatibility
- No wire-protocol change. No breaking change vs. 0.4.2. **Security-relevant — upgrade recommended.**

---

## [0.4.2] — 2026-05-06

### Fixed
- **`evm_node.dev.insufficient_fees` rejections — now solved at the root.** The 0.4.1 fix used a flat `× 1.2` buffer on Taquito's auto-estimate, but Previewnet kept rejecting a residual fraction of operations (e.g. `current: 0.001322 / required: 0.001411`, `current: 0.000753 / required: 0.000880`). Root cause: Taquito's fee formula is hardcoded against Tezos mainnet constants (`MINIMAL_FEE_PER_GAS_MUTEZ = 0.1 mutez/gas`, `MINIMAL_FEE_PER_BYTE_MUTEZ = 1 mutez/byte`), but the TezosX kernel uses a different schedule (cheaper gas, more expensive bytes). No multiplier on the wrong base formula can produce the kernel's exact value.
- **Replaced the buffer with a kernel-aware fee computation.** `LocalSignerClient.transferWithKernelAwareFees` now reads the live constants from the kernel's `chains/main/mempool/filter` RPC (`minimal_fees`, `minimal_nanotez_per_gas_unit`, `minimal_nanotez_per_byte`, returned as Q-rationals), caches them for 30 s, and computes the fee with the kernel's exact formula: `minimal_fees + ⌈gas × per_gas / 1000⌉ + ⌈opSize × per_byte / 1000⌉` (mutez, BigInt arithmetic). Operations are accepted on the first try; no buffer, no over-payment.
- **Retry-on-error kept as a last-resort fallback.** If a residual `insufficient_fees` slips through (rare — e.g. opSize shifts by a few bytes after fee/gas override), the error's `required` field is parsed and the op is resubmitted once with that exact value. Belt-and-braces; expected to almost never fire in practice.

### Compatibility
- No wire-protocol change. No breaking change vs. 0.4.1.
- Same approach as `octez-client` post-MRs !21028 / !21050 / !21155 / !21199 (live constants from the node, not hardcoded).

---

## [0.4.1] — 2026-05-06

### Fixed
- **`evm_node.dev.insufficient_fees` rejections on Previewnet.** `LocalSignerClient` no longer relies solely on Taquito's auto-fee estimate, which under-shoots the kernel's requirement by ~10–20% (e.g. `current: 0.001086 / required: 0.001283`). `sendContractCall` and `sendNativeTransfer` now go through a new `transferWithBufferedFees`: pre-estimate via `toolkit.estimate.transfer`, then submit with `fee × 1.2`, `gasLimit × 1.2` and `storageLimit × 1.5 + 1`.

### Changed
- **UI / docs rebrand to align with the Tezos X narrative** (one ledger, two runtimes — not a two-chain bridge):
  - "Tezos L1" → **"Michelson runtime"** in every user-visible label and prose (ChainPill, AccountCard, RoutingCard, Send, Settings, Receive, Home, etc.). Code comments aligned too.
  - "Tezos L2" → **"EVM runtime"** in every user-visible label and prose.
  - Internal identifiers untouched: `chain: 'l1' | 'l2'`, `TEZOS_L1_RPC`, `fetchL1XtzBalance`, the wire-protocol field `runtime: 'l1' | 'l2'`, and the purple/cyan tokens are all preserved.
- New Tezos brand SVG logos in white + blue. Replaces the legacy `tezos-logo.png` in the website navbar/favicon, the FlowSection landing diagram, and the relayer extension popup. Old PNGs deleted.
- **Asset rows now show real brand logos** Files live in `packages/wallet/icons/{tezos-logo.svg,circle-usdc.png}` and are bundled by Vite imports.
- **Faucet URL** updated to the canonical Previewnet endpoint `https://faucet.previewnet.tezosx.nomadic-labs.com/` (was the Vercel airdrop demo).
- **Assets section header is now a runtime filter.** Click "All chains" to cycle through `All chains → Michelson runtime → EVM runtime → All chains` and hide rows that don't match. Pure UI state, no balance refetch.

### Compatibility
- No wire-protocol change. No breaking change vs. 0.4.0.

---

## [0.4.0] — 2026-05-05

### Changed
- **Removed "Etherlink L2" branding throughout the UI.** Aligns with the Tezos X narrative. The internal `chain: 'l1' | 'l2'` semantics and the purple/cyan token system are unchanged — only the visible labels.
- **Same-runtime XTZ transfers now skip the NAC gateway.** When the recipient is a Tezos address (`tz1 / tz2 / tz3 / KT1`), the wallet emits a **native Tezos L1 transfer** via Taquito (`toolkit.contract.transfer({ to, amount, mutez: true })`) instead of routing through the `KT18oDJJ…` gateway with a `default` entrypoint that forwarded the value back to the same recipient. Saves the round-trip CRAC, the synthetic-EVM-hash plumbing, and the associated fees / latency.
- The cross-runtime path (`tz1 → 0x`) is unchanged: still routes through the NAC gateway because the kernel needs to materialise the value on the EVM runtime.
- USDC sends are unchanged: still go through the gateway's `call_evm` (USDC is an ERC-20 on L2, no native L1 path possible).
- Popup-side dApp calls (`eth_sendTransaction` from `handleEthereumRequest`) are unchanged: a dApp signing through the wallet always targets EVM state, so cross-runtime by construction.
- **Send "Done" stage now shows the real EVM hash on cross-runtime transfers**, not the synthetic NAC placeholder. After broadcasting the L1 op, the popup transitions to a new `resolving` stage ("Confirming on Etherlink L2…") and polls the SW until the kernel-synthesized real hash is mined (up to 60 s). Only then does it transition to "Done". If the resolver times out, the UI falls back to showing the underlying L1 op hash with an explicit "EVM tx pending" hint — at no point is the synthetic hash shown to the user.
- **The hash on the "Done" stage is now a clickable link** that opens the right explorer for the runtime:
  - `tz1 → tz1 / KT1` → tzkt (`previewnet.tezosx.tzkt.io/{opHash}`)
  - `tz1 → 0x` resolved → Blockscout (`blockscout.previewnet.tezosx.nomadic-labs.com/tx/{realEvmHash}`)
  - `tz1 → 0x` unresolved (timeout fallback) → tzkt on the L1 op hash
- **`USDC_CONTRACT` updated** to the Previewnet deployment `0xd77420F73B4612a7A99DBA8c2AFd30a1886b0344`.

### Added
- `LocalSignerClient.sendNativeTransfer(to, mutezAmount)` — wallet-internal method that emits a plain Tezos L1 transfer with no contract call. Sits next to `sendContractCall`; the relayer's `ITezosWalletClient` interface is unchanged (this is a wallet-only concern).
- Service worker keeps the `LocalSignerClient` reachable at module scope so the popup `SEND_TX` handler can pick the right path (native vs gateway) without rebuilding the toolkit.
- New `RESOLVE_TX { syntheticHash }` envelope between popup and SW — the popup polls it during the `resolving` stage; the SW delegates to the relayer's new `resolveSyntheticHash` API.
- New `SendTxResult` and `ResolveTxResult` types in `lib/messages.ts` so the popup knows the runtime / status of the result and picks the right explorer.

### Internals
- `case 'SEND_TX'` in `service-worker.ts` now branches on `detectRuntime(msg.to)` — same-runtime XTZ takes the native fast path, everything else (cross-runtime XTZ, USDC) falls through to the existing `provider.request('eth_sendTransaction', …)` flow and returns the synthetic hash for the popup to resolve asynchronously.
- New `case 'RESOLVE_TX'` calls `provider.resolveSyntheticHash(syntheticHash)` and returns `{ resolved, hash? }`.

### Compatibility
- Requires `@tezosx/relayer` 0.4.1 (new public `resolveSyntheticHash` / `getPendingL1Hash` APIs).
- No change to the EIP-1193 surface exposed to dApps — they keep receiving the synthetic hash from `eth_sendTransaction` and the real hash via `eth_getTransactionByHash` / `Receipt`. The new flow is wallet-popup-internal.

---

## [0.3.1] — 2026-05-04

### Changed
- **Send page now spells out the cross-runtime semantics.** A new `RoutingCard` sits below the recipient input and reacts in real time to the address you type:
  - `tz1 / tz2 / tz3 / KT1` → purple pill **Tezos L1** + "Same-runtime transfer · settles on Tezos L1 (Michelson)".
  - `0x…` → purple → cyan pills + "Cross-runtime transfer · your tz1 signs, the kernel credits the EVM address (via NAC gateway)".
  - `USDC + tz1…` → soft warning "USDC only exists on Etherlink L2 — enter a 0x address" and the Review button stays disabled.
- **Asset cards** updated to reflect the actual asset semantics, not a runtime claim: XTZ is labelled "Native asset" (it lives on both runtimes); USDC keeps "Etherlink L2 · ERC-20".
- **Recipient placeholder** changed from `tz1… or tz2…` to `tz1… or 0x…` (or `0x…` only for USDC), so the cross-runtime path is visible at a glance.
- **Review stage** : the from→to lane now sources the destination chain from the address itself instead of the asset, the centre arrow gets a purple→cyan gradient when the call crosses runtimes, and a new **Routing** row makes the path explicit ("Same-runtime · Tezos L1" or "Cross-runtime · L1 → L2 via NAC gateway").
- **Sending / Done stages** : suffix corrected from a fixed "Tezos L1 / Etherlink L2" to "via NAC gateway" or "on Tezos L1" depending on the actual destination.

### Added
- `lib/address.ts` — central place for recipient parsing: `DestRuntime` type, `detectRuntime(addr)`, `isValidAddress(addr)`. Reused by `Send` today, available for `Approve` and any future address book / contacts UI.

### Compatibility
- No wire-protocol change. The popup → service worker `SEND_TX` envelope is unchanged; the relayer's NAC gateway already routes correctly based on the address format. This release is strictly UI clarity.

---

## [0.3.0] — 2026-05-04

### Changed (breaking — default network)
- **Default network migrated from `testnet` to Tezos X Previewnet.** Inherits the new endpoint defaults from `@tezosx/relayer` 0.4.0 (`evm.previewnet.tezosx.nomadic-labs.com` and `michelson.previewnet.tezosx.nomadic-labs.com`). The deprecated `demo.txpark.nomadic-labs.com` is removed from `manifest.json` `host_permissions`.
- Block explorer URLs in `src/lib/constants.ts` updated:
  - `EVM_EXPLORER`   → `https://blockscout.previewnet.tezosx.nomadic-labs.com`
  - `TEZOS_EXPLORER` → `https://previewnet.tezosx.tzkt.io`
- Settings → Network row now reads **Tezos X Previewnet**.

### Added
- **`isTezosXRelayer = true`** flag on the injected `window.ethereum` provider. dApps that route through the NAC gateway flow (notably tzbutton) detect this flag to skip "no native XTZ on L2 for gas" balance checks — fees are paid on Michelson L1, so an empty L2 balance is normal for relayer-routed wallets. Convention shared with `@tezosx/relayer`.

### Fixed
- Home page XTZ balance now formats with **2 decimal places max** instead of up to 4. Aligns with how XTZ amounts are typically displayed and avoids overflow on large balances.

### Compatibility
- Requires `@tezosx/relayer` 0.4.0.

---

## [0.2.0] — 2026-04-24

### Added
- **Import from Tezos secret key (`edsk…`)** alongside BIP-39 mnemonic. The Import page now exposes a two-tab switcher (Recovery phrase / Private key) and accepts both the 54-char seed form and the 98-char full-secret-key form.
- **L1 XTZ balance** on the Home dashboard: the XTZ row now queries the tz1 directly via the Tezos L1 RPC (`/chains/main/blocks/head/context/contracts/{tz1}/balance`) and renders the real on-chain balance, instead of the EVM-alias balance which represents a different account on a different runtime.
- **Receive page** with a Tezos L1 / Etherlink L2 toggle, QR code, and copy action — reachable from the Home actions row.
- **`Buffer` polyfill shim** wired into the three wallet entry points (popup, approval popup, service worker), so Taquito's signer bundle can resolve `globalThis.Buffer` without relying on CDN externalisation.
- **Richer service-worker diagnostics** on transaction failures: the SW and the local signer now log the full Taquito error (including the nested `errors[]` array) so that opaque `tezlink_error` wrappers can be unpacked.

### Changed
- **Full UI redesign** on a new internal design system (`--tx-*` tokens, Aspekta Variable font, Metals.io-style spacing / radii / typography discipline). All pages ported: Welcome, Create (4-stage flow: intro → blurred-until-revealed phrase → 3-position confirm → password), Import, Unlock, Home (split L1/L2 account card + hero balance + 3-action row + assets list), Send (form → review with from→to lane → sending → done), Activity, Connections, Settings (bottom-sheet reveal modal), Approve (origin header + risk meter + decoded call card), and a new Receive page.
- **Action bars** now distribute buttons correctly: two `.full` buttons share the width evenly; a single `.full` fills the remaining space beside a narrow secondary action.
- **`USDC_CONTRACT`** constant bumped to the current tzButton testnet deployment (`0xdcd349f9c09085ba51ab0d317238664aa5d8a134`). The previous address referenced a stale deployment whose balance was unrelated to the current on-chain USDC used by connected dApps.

### Removed
- Legacy shadcn-ui component tree (`src/components/ui/*`, `src/lib/utils.ts`, `components.json`) and its runtime dependencies (`@base-ui/react`, `class-variance-authority`, `lucide-react`, `shadcn`, `tailwind-merge`, `tw-animate-css`, `@fontsource-variable/geist`). All UI primitives now live under `src/ui/tx/`.
- Two no-longer-referenced helper components: `Header.tsx`, `NavBar.tsx`, `Spinner.tsx`.

### Fixed
- Approval popup rendered as a blank window under certain Chrome window sizes because `.tx-approval` had a `min-height` but no definite `height`, which collapsed flex children to zero. The shell now uses `height: 100vh` with `min-height: 600px` as a floor.
- Legacy Tailwind utility classes on `popup.html` / `approve.html` (`bg-slate-950`, etc.) removed — the body now inherits the dark background from the design tokens in `styles.css`.

### Compatibility
- Requires `@tezosx/relayer` 0.3.0.

---

## [0.1.0] — 2026-04-23

### Added
- Initial MV3 wallet extension: local BIP-39 seed generation (24 words), AES-256-GCM-encrypted vault in `chrome.storage.local`, Tezos identity derivation via `@taquito/signer` (`SLIP-10` `m/44'/1729'/0'/0'`), lock/unlock lifecycle.
- Popup UI (360 × 600) with Welcome / Create / Import / Unlock / Home / Send / Activity / Connections / Settings pages.
- EIP-1193 provider injection on every page via `content_scripts` (MAIN world) with an ISOLATED-world bridge relaying requests to the service worker.
- EIP-6963 multi-wallet discovery announcement.
- Approval popup window opened by the service worker on `eth_requestAccounts` / `eth_sendTransaction`, with a Connect view and a Signature view.
- `LocalSignerClient` implementing `ITezosWalletClient` on top of Taquito's `InMemorySigner`, replacing the Beacon / Temple backend.
- Per-origin session tracking (`StoredSession`) with per-site disconnect.
