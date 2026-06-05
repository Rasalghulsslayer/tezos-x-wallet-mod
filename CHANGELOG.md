# Changelog

This monorepo ships **two independently versioned packages**. Each has its own changelog with the full set of release notes:

- **`@tezosx/relayer`** — [packages/relayer/CHANGELOG.md](packages/relayer/CHANGELOG.md)
- **`@tezosx/wallet`** — [packages/wallet/CHANGELOG.md](packages/wallet/CHANGELOG.md)

This file is an index of releases. For details (added / changed / fixed / compatibility notes), follow the link to the relevant package changelog.

---

## 2026-06-04

- **`@tezosx/wallet` 0.11.3** + **`@tezosx/relayer` 0.5.5** — follow-up patch on the cross-runtime resolver. When the user's destination is the EVM-encoded form of a Tezos L1 entity (a KT1 contract, or another tz1's alias), the kernel doesn't synthesize an EVM transfer to that address — it routes the value via L1 (AliasForwarder / contract call) and emits a bookkeeping EVM tx whose `to` is the sender's own alias. 0.11.2's matcher only accepted `tx.to === destination` and missed this case, so the Send timeline stayed stuck on "broadcasting". The matcher now accepts `tx.to ∈ {destination, senderAlias}` with the same value, covering both the direct-EVM and L1-routed shapes. `findRealHash` gains a required `senderAlias` argument (breaking on that internal surface; no other consumers known). 160 / 160 tests pass. → [wallet details](packages/wallet/CHANGELOG.md#0113--2026-06-04) · [relayer details](packages/relayer/CHANGELOG.md#055--2026-06-04)
- **`@tezosx/wallet` 0.11.2** + **`@tezosx/relayer` 0.5.4** — patch fixing the cross-runtime status resolver. After a tz1 → 0x transfer, the wallet UI used to stall at "broadcasting" because `findRealHash` couldn't correlate the kernel-synthesized EVM tx back to the L1 op — it filtered on `from === alias`, but the kernel uses a constant system address (`0x7e20580000000000000000000000000000000001`) as the `from` field, with the originating tz1's alias absent from the synthesized tx. The matcher is now keyed on `(to, value)` from the original `eth_sendTransaction` request, both of which the kernel carries forward verbatim. `EvmTxSummary` and `PendingOp` each gain a `value` field; per-block candidate sort by nonce is preserved. Breaking change on `findRealHash`'s signature (internal-only consumers as far as we know). → [wallet details](packages/wallet/CHANGELOG.md#0112--2026-06-04) · [relayer details](packages/relayer/CHANGELOG.md#054--2026-06-04)

---

## 2026-06-02

- **`@tezosx/wallet` 0.11.1** — patch fixing two issues surfaced by dApp-integration testing. **(1)** `window.ethereum.isTezosXRelayer` is now `true` only when the active account is Tezos-source (route via NAC gateway), and `false` for EVM-source 0x accounts. The flag used to be a constant `true`, which confused dApps that branch on it — they'd skip the standard ERC-20 `approve` step thinking the NAC-routed flow handled it implicitly, then `transferFrom` would revert. A new `WALLET_ROLE` ContentPush event is broadcast on every container rebuild and forwarded by the bridge to the injected provider, which mutates the flag accordingly. **(2)** The Approve popup now scrolls correctly when the cross-runtime card pushes content past the viewport — the root container was `minHeight: 100vh` (could grow past viewport, breaking the internal scrollable area's overflow clipping); changed to `height: 100vh`. Both fixes are wire-compatible additions; no vault / storage / signing change. → [details](packages/wallet/CHANGELOG.md#0111--2026-06-02)
- **`@tezosx/wallet` 0.11.0** + **`@tezosx/relayer` 0.5.3** — minor release hardening the signing path and the cross-runtime UX. Signature methods (`eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4`) now require an active session for the calling origin — unconnected tabs receive EIP-1193 `4100` instead of a popup. `EvmProvider` gains a per-account FIFO + pending-nonce counter so concurrent sends get sequential nonces. The synthetic-hash resolver correlates kernel-synthesized EVM txs by `from === alias` plus nonce ordering (was `from || to === alias`), eliminating the swap risk between two concurrent tz1 → 0x ops to/from the same alias. The Approve popup for Tezos-source `eth_sendTransaction` adds a "What you actually sign" card showing the resolved Michelson target (`KT1…`), entrypoint, 4-byte selector, and mutez value alongside the dApp's stated `to / value / data`. The relayer drops its remote 4byte.directory selector fallback in favour of a local audited allow-list (`UnknownSelectorError` thrown otherwise), and rejects sub-mutez wei remainders on tz1 → 0x with `SubMutezPrecisionError`. 3 new regression tests; total suite 160. No vault, message-on-the-wire compatibility break; dApp behaviour change is the new `4100` for unconnected sign calls (standard EIP-1193). → [wallet details](packages/wallet/CHANGELOG.md#0110--2026-06-02) · [relayer details](packages/relayer/CHANGELOG.md#053--2026-06-02)
- **`@tezosx/wallet` 0.10.2** + **`@tezosx/relayer` 0.5.2** — security patch addressing three findings from the 2026-06-01 audit batch (`docs/audit/`). `eth_getTransactionReceipt` on the relayer no longer fabricates a `status: 0x1` receipt for unresolved cross-runtime tx — returns `null` per JSON-RPC spec so dApp pollers keep polling instead of seeing a forged success. **(F3 / EXT-4, High)** `eth_accounts` now returns `[]` to origins that haven't connected — closes a fingerprinting / de-anonymisation vector at the wallet ↔ dApp boundary. **(Test infra, Critical-blocker)** CI now actually runs the wallet test suite — previously the workflow shipped 7 jobs (lint / typecheck / build) but zero invocations of vitest, so the 153 existing tests caught nothing on PRs; the new `test-wallet` job gates `build-wallet`, and a 30 s `testTimeout` in `vitest.config.ts` keeps the Q0 multi-account cap test (49 sequential PBKDF2-200k iterations) within budget on slow runners. 4 new regression tests pin the `eth_accounts` gating; `buildSyntheticReceipt` is deleted from the relayer (no internal callers remained). No vault, message, or storage change. → [wallet details](packages/wallet/CHANGELOG.md#0102--2026-06-02) · [relayer details](packages/relayer/CHANGELOG.md#052--2026-06-02)
- **`@tezosx/wallet` 0.10.1** — patch. **L2 transaction finality switches from a 2-confirmation heuristic to the `finalized` block tag** on the Tezlink EVM RPC. Per Thomas Letan's feedback (`#techrel-tezosx-mvp`, 2026-05-15), L2 finality on Tezos X is driven by L1 inclusion, not by L2 block count — L2 blocks above the tx provide no additional guarantee beyond the finality of the L1 block they share. `pollL2` now polls `eth_getBlockByNumber("finalized", false)` and considers the tx finalised when its block number is ≤ the finalised block. The L1 path (Tezos Tenderbake) is unchanged — `head.level - op.level >= 2` remains canonical. Constant renamed `FINALIZED_AFTER_BLOCKS` → `TEZOS_L1_FINALITY_BLOCKS` to pin its scope. UI copy updated: L2 final step reads "Finalized on L1", L1 final step says "attestations" (Tenderbake). The "All / L1 / L2" segmented filter on Home's Assets section is dropped (redundant with per-row ChainPills; reinforced a two-chains mental model Tezos X doesn't have). 7 new unit tests pin the L2 finality model. No vault / message / storage change. → [details](packages/wallet/CHANGELOG.md#0101--2026-06-02)
- **`@tezosx/wallet` 0.10.0** — feature minor. **Custom ERC-20 token support, end-to-end.** Users can register any ERC-20 deployed on the Tezos X EVM runtime by pasting its contract address; the wallet reads `symbol()` / `decimals()` / `name()` via three `eth_call`s and persists the entry per-account in `chrome.storage.local`. The token then renders identically to native assets across Home, Send, and the Activity feed (the latter newly decodes ERC-20 Transfer events for every registered token — USDC included, which did not surface as activity rows before 0.10.0). New 3-stage AddToken flow at `/tokens/add` with a peek-then-commit architecture so cancelling mid-confirm does not leave the token in the registry; a `tryAnyway` branch surfaces a non-dismissable yellow band + Blockscout deep-link for non-standard contracts. USDC is internally re-modelled as a default-seeded entry in the per-account registry (builtin, non-removable) — all `if (asset === 'USDC')` special cases collapse to "iterate registered tokens", no user-visible change to the existing USDC flow. The flow wears the cyan EVM-runtime accent (`variant="accent-cyan"`) since ERC-20s are L2 objects. `Asset` is now a discriminated union (`xtz | erc20`); `formatUsdc` / `AssetId` / `USDC_ASSET` are removed. Up to `MAX_TOKENS_PER_ACCOUNT = 30` tokens per account. No vault format change; no relayer change. → [details](packages/wallet/CHANGELOG.md#0100--2026-06-02)

---

## 2026-05-21

- **`@tezosx/wallet` 0.9.0** — feature minor. **Multi-account vaults end-to-end:** a single vault now holds N accounts (cap 50) of any mix of Tezos and EVM kinds. From an unlocked vault the user can add (Create or Import) without re-entering the password, switch active, rename, and remove. The v2 vault shape from 0.7.0 is the canonical home — no format migration needed. AccountIds switch to UUID v4 (decouples identity from address; two accounts derived from the same key are now deliberately allowed). MetaMask-style dApp semantics (Model A) — an active switch broadcasts EIP-1193 `accountsChanged` to every connected origin. Pending approvals stay pinned to the accountId they were enqueued under; the Approve popup renders an AccountChip showing which account will sign. Settings gains a per-account Reveal Secret picker and the Connections page gains an "All accounts / This account" filter persisted in `chrome.storage.local`. New `domain/vault.ts` houses pure mutation helpers; the Keyring is now an orchestrator (crypto + persistence + unlock cache). Container cache (LRU, size 16) memoises Container instances per accountId for sub-50ms switches; the cache is also consulted on the pinned-container resolution path. No relayer change. → [details](packages/wallet/CHANGELOG.md#090--2026-05-21)

---

## 2026-05-19

- **`@tezosx/wallet` 0.8.0** — feature minor. **Functional Activity tab:** merges TzKT (tz1 L1 ops) and Blockscout (EVM txs) into one feed, dedupes cross-runtime `tz1 → 0x` ops via `l1OpHashToEvmHash`, overlays pending L1→L2 ops from `RelayerProvider.listPendingOps`, drops AliasForwarder self-transfers by default. Auto-refresh every 30 s uses a Twitter-style "N new activity · refresh" pill rather than overwriting the rendered list — user controls when their context updates. Filter chips (direction + runtime). Cursor-based pagination across both sources, opaque to the UI. **Vitest test runner** lands for the first time with 44 unit tests pinning the merge algorithm, the precompile-input decoder, the cursor round-trip, and the row VM projection. Pins `@tezosx/relayer ^0.5.0` (resolves to 0.5.1). → [details](packages/wallet/CHANGELOG.md#080--2026-05-19)
- **`@tezosx/relayer` 0.5.1** — patch. **New `RelayerProvider.listPendingOps()`** read-only snapshot of L1→L2 ops the SDK has broadcast but the kernel hasn't yet synthesized into an EVM tx. Consumed by wallet 0.8.0's Activity tab to surface "pending EVM effect" rows before TzKT or Blockscout sees them. New `PendingOpView` type re-exported through `@tezosx/relayer/tezos`. Additive only; wallet 0.7.0 builds unchanged. → [details](packages/relayer/CHANGELOG.md#051--2026-05-19)

---

## 2026-05-15

- **`@tezosx/wallet` 0.7.0** — feature minor. **L2 finality is now L1-anchored:** the Send timeline stops waiting for additional L2 blocks beyond inclusion (a heuristic ported from Ethereum mainnet that doesn't apply on Tezos X) and flips to "Finalized" as soon as the EVM receipt is observed — the underlying L2 block was already produced from an L1 commitment. **Symmetric EVM-native accounts end-to-end:** a vault can now hold a secp256k1 account that signs EVM transactions directly. Welcome ships a binary runtime selector (Michelson vs. EVM); Create / Import are kind-aware; Send routes the 4 combinations of source kind × destination address (`tz1 → tz1`, `tz1 → 0x` via NAC gateway, `0x → 0x` native, `0x → tz1` via NAC precompile at `0xff…007`). New `SignatureView` in the approval popup gates `personal_sign` / `eth_signTypedData_v4`. Vault format upgraded in place to V2 multi-account shape (`{ version, accounts, active, secrets }`), with eager session-store migration; 0.6.0 vaults open unchanged on first unlock. Wallet architecture refactored to ports-and-adapters: `domain/`, `ports/`, `use-cases/`, `adapters/{tezos,evm,chrome}/`, `composition/`. Pins `@tezosx/relayer ^0.5.0`. Three signing-layer regressions fixed late in the cycle: noble v2's `sign()` defaulting to `prehash: true` (re-hashed our keccak256 with sha256 → recovered to wrong sender → kernel evicted from mempool), `bytesToHex` no longer assumes a `0x` prefix, `decideRoute` now branches on `account.kind` instead of hardcoding `'michelson'`. → [details](packages/wallet/CHANGELOG.md#070--2026-05-15)

---

## 2026-05-12

- **`@tezosx/relayer` 0.5.0** — feature minor (companion SDK release for the wallet 0.7.0 refactor). **New named entry points** sitting alongside the existing per-file paths: `@tezosx/relayer/tezos` curates the Tezos-consumer surface (`RelayerProvider`, `BeaconClient`, `TezlinkClient`, plus `buildTezosToEvmCall`, `deriveEvmAlias`, `resolveTezosAddress`), `@tezosx/relayer/evm` exposes the EVM-consumer surface for direct precompile usage (`encodeNacTransfer`, `encodeNacCallMichelson`, `buildCrossRuntimeTx`, `buildEvmToTezosCall`, `trackCrossRuntimeStatus`, `NAC_PRECOMPILE_ADDR`, `NAC_RECOMMENDED_GAS`), `@tezosx/relayer/types` re-exports the entire `domain/` and `ports/` layers. Use cases extracted as pure functions under `src/use-cases/`. Domain layer under `src/domain/` holds every runtime-agnostic type and error. Legacy per-file paths continue to resolve via re-exports — wallet 0.6.0 builds unchanged. → [details](packages/relayer/CHANGELOG.md#050--2026-05-12)

---

## 2026-05-07

- **`@tezosx/wallet` 0.6.0** — feature minor. **Toolbar badge for pending dApp requests:** the extension icon now shows the count of pending approvals (`eth_requestAccounts`, `eth_sendTransaction`); cleared on approve/reject/lock/SW restart, and closing the approval window with the Chrome × is now correctly treated as a reject (was a latent bug). **Live status timeline on the Send "Done" screen:** Broadcasted → Included → Finalized, polling TzKT (L1 native) or the Tezlink EVM JSON-RPC (cross-runtime) every 2–5 s until finality (≥ 2 confirmations), with a "Status unavailable" fallback after a 2-minute timeout. New `lib/badge.ts`, `lib/poller.ts`, `lib/tx-status.ts`, and `ui/tx/StatusTimeline.tsx`. → [details](packages/wallet/CHANGELOG.md#060--2026-05-07)
- **`@tezosx/wallet` 0.5.0** — UI minor. **Side panel mode (Chrome 114+):** dock the wallet UI as a persistent panel via a new icon in the Home top bar; popup remains the default click behavior. **Send page UX overhaul:** "Available · balance" row + `MAX` pill under the amount input (with soft-red insufficient state and loading skeleton); "Likely insufficient funds" banner on the review stage (CTA stays primary — kernel may settle). **Unified error display** across every wallet surface: new `formatError(err, ctx?)` dispatcher in `lib/errors.ts` covers Tezos RPC, auth, EIP-1193 and network families; new `ErrorInline` / `FatalScreen` / danger `Toast` components round out the existing `ErrorCard`. `sendPopupRequest` now throws a typed `Error & { code }` so EIP-1193 codes survive end-to-end. Visual specs from the Claude Design handoff bundles. → [details](packages/wallet/CHANGELOG.md#050--2026-05-07)

---

## 2026-05-06

- **`@tezosx/wallet` 0.4.3** — security + UX patch. **Security:** closes a clickjacking vector on the approval popup (reported responsibly by Eugene Yakovchuk) by removing `approve.html` from `web_accessible_resources`, adding `Content-Security-Policy: frame-ancestors 'none'`, and a runtime iframe guard before React mounts. Three independent layers, any one of which suffices. **UX:** persistent, non-dismissible "Experimental software · Pre-release POC · Do not use with mainnet funds" banner across every wallet page and the documentation site (per François Thiré's request). → [details](packages/wallet/CHANGELOG.md#043--2026-05-06)
- **`@tezosx/wallet` 0.4.2** — patch release: solves the residual `evm_node.dev.insufficient_fees` rejections that the 0.4.1 buffer didn't catch. Root cause was that Taquito's fee formula is hardcoded against Tezos mainnet constants (`MINIMAL_FEE_PER_GAS_MUTEZ = 0.1`, `MINIMAL_FEE_PER_BYTE_MUTEZ = 1`) while the TezosX kernel uses a different schedule (cheaper gas, more expensive bytes) — no multiplier on the wrong base formula could yield the kernel's exact value. `LocalSignerClient` now reads live constants from `chains/main/mempool/filter` and computes the kernel-exact fee; same approach as `octez-client` post-MRs !21028/21050/21155/21199. → [details](packages/wallet/CHANGELOG.md#042--2026-05-06)
- **`@tezosx/wallet` 0.4.1** — patch release: first attempt at fixing `evm_node.dev.insufficient_fees` rejections via a Taquito pre-estimate + flat `× 1.2` safety buffer (superseded by 0.4.2). Ships the UI/docs rebrand to align with the Tezos X narrative ("Tezos L1" → "Michelson runtime", "Tezos L2" → "EVM runtime"; internal identifiers untouched). New Tezos SVG brand logos. → [details](packages/wallet/CHANGELOG.md#041--2026-05-06)

---

## 2026-05-05

- **`@tezosx/relayer` 0.4.1** — public hash-resolution APIs: `resolveSyntheticHash` and `getPendingL1Hash` on `RelayerProvider`, so wallet UIs can wait for the kernel-synthesized real EVM hash before showing transaction results. Additive, no breaking change. → [details](packages/relayer/CHANGELOG.md#041--2026-05-05)
- **`@tezosx/wallet` 0.4.0** — two things in one release:
  1. **Same-runtime XTZ transfers skip the NAC gateway** — `tz1 → tz1 / KT1` now emits a native Tezos L1 transfer via Taquito, saving the unnecessary CRAC round-trip.
  2. **Real EVM hash on cross-runtime sends** — the Send "Done" stage no longer shows a synthetic placeholder. After broadcasting the L1 op, the popup waits in a `resolving` stage until the kernel-synthesized real hash is mined, then renders the hash as a clickable link to the right explorer (tzkt for L1, Blockscout for L2). Falls back to the L1 op hash with an "EVM tx pending" hint on resolver timeout.
  3. USDC contract bumped to the Previewnet deployment `0xd77420F73B4612a7A99DBA8c2AFd30a1886b0344`. → [details](packages/wallet/CHANGELOG.md#040--2026-05-05)

---

## 2026-05-04

- **`@tezosx/wallet` 0.3.1** — Send page makes the cross-runtime semantics explicit: a `RoutingCard` reacts to the recipient address in real time (same-runtime `tz1 → tz1` vs cross-runtime `tz1 → 0x` via NAC gateway), Review stage shows a Routing row and a gradient arrow when the call crosses runtimes, asset cards no longer claim a fixed runtime for XTZ. New `lib/address.ts` helper for recipient parsing. UI-only, no wire-protocol change. → [details](packages/wallet/CHANGELOG.md#031--2026-05-04)
- **`@tezosx/relayer` 0.4.0** — **breaking, default network**: migration from the legacy `demo.txpark` testnet to **Tezos X Previewnet** (`evm.previewnet.tezosx.nomadic-labs.com` + `michelson.previewnet.tezosx.nomadic-labs.com`). Extension `host_permissions` and chain-name table updated to chain ID `128064`. → [details](packages/relayer/CHANGELOG.md#040--2026-05-04)
- **`@tezosx/wallet` 0.3.0** — inherits the Previewnet endpoints from relayer 0.4.0; explorer URLs (`blockscout.previewnet…` + `previewnet.tezosx.tzkt.io`) updated; Settings → Network reads Tezos X Previewnet; Home XTZ balance now capped at 2 decimal places. → [details](packages/wallet/CHANGELOG.md#030--2026-05-04)

---

## 2026-04-24

- **`@tezosx/relayer` 0.3.0** — monorepo restructure (now published as `@tezosx/relayer`), fee-model methods short-circuited (`eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`), `KNOWN_SIGNATURES` registry expanded with standard ERC-20 / DeFi escrow selectors, gateway selector logging. No breaking change vs 0.2.2. → [details](packages/relayer/CHANGELOG.md#030--2026-04-24)
- **`@tezosx/wallet` 0.2.0** — first release as a published package. UI redesign on the new `--tx-*` design system, Tezos `edsk…` import alongside BIP-39, L1 XTZ balance read from the tz1, Receive page, Buffer polyfill shim, shadcn cleanup. Embeds `@tezosx/relayer` 0.3.0. → [details](packages/wallet/CHANGELOG.md#020--2026-04-24)

---

## 2026-04-23

- **`@tezosx/relayer` 0.2.2** — `call_evm` migrated to the new 4-field Michelson signature (matches kernel hard reset). Breaking: only works against kernels deployed on or after 2026-04-22. → [details](packages/relayer/CHANGELOG.md#022--2026-04-23)
- **`@tezosx/wallet` 0.1.0** — initial wallet MVP shipped with the v0.3.0 monorepo restructure. → [details](packages/wallet/CHANGELOG.md#010--2026-04-23)

---

## 2026-04-22

- **`@tezosx/relayer` 0.2.1** — real EVM transaction resolution (`eth_getTransactionByHash` / `Receipt` map synthetic NAC hashes back to kernel-synthesized EVM tx), in-flight deduplication, RPC proxy fallback, callMichelson selector registry, fee/gas/storage limits raised, nonce now proxied. → [details](packages/relayer/CHANGELOG.md#021--2026-04-22)

---

## 2026-04-15

- **`@tezosx/relayer` 0.2.0** — Chrome/Brave/Firefox MV3 extension introduced (replaces Tampermonkey), persistent session tracking, popup UI. → [details](packages/relayer/CHANGELOG.md#020--2026-04-15)

---

## 2026-03-24

- **`@tezosx/relayer` 0.1.0** — first release. EIP-1193 provider, EIP-6963 discovery, Temple via Beacon, NAC gateway routing, Tampermonkey injection guide, Docusaurus docs, GitLab CI, playground. → [details](packages/relayer/CHANGELOG.md#010--2026-03-24)
