# Changelog — TezosX Wallet

All notable changes to the TezosX Wallet are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

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
