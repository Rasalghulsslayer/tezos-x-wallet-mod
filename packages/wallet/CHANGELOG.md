# Changelog — TezosX Wallet

All notable changes to the TezosX Wallet are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

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
