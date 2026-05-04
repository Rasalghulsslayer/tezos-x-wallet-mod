# Changelog — TezosX Wallet

All notable changes to the TezosX Wallet are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.3.0] — 2026-04-25

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
