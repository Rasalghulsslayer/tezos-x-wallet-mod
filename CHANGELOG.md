# Changelog

All notable changes to the Tezos X Relayer are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.2.1] — 2026-04-17

### Added
- **Real EVM receipt resolution**: `eth_getTransactionReceipt` now maps the synthetic NAC hash back to the actual kernel-synthesized EVM transaction by scanning blocks from send-time onward and matching the first unclaimed tx whose `from` equals the user's alias. Returns the real receipt with real `transactionHash`, real `logs`, real `gasUsed`, real `blockNumber`. Unblocks event-driven dApps (TzButton, DEX, lending, etc.) that rely on `receipt.logs`. Pure-functional implementation in `src/utils/resolver.ts` with recursive block traversal and per-session hash deduplication.

### Fixed
- **RPC proxy**: unknown JSON-RPC methods (`eth_blockNumber`, `eth_getBlockByNumber`, `eth_gasPrice`, `eth_estimateGas`, `eth_getCode`, `eth_getLogs`, etc.) are now forwarded to the Tezlink EVM node instead of throwing `METHOD_NOT_FOUND`. Fixes ethers.js `tx.wait()` and viem compatibility.
- **callMichelson selector**: added a local registry (`KNOWN_SIGNATURES`) for Tezos X-specific selectors. `callMichelson(string,string,bytes)` is now resolved locally instead of failing on 4byte.directory lookup. Fixes `invalid input encoding` error on NAC gateway.
- **Fee / gas / storage limits**: increased from `fee:1000 / gas:15000 / storage:0` to `fee:100000 / gas:1040000 / storage:60000`. Temple re-estimates before submission. Fixes "No tip, no trip" and OutOfGas errors on cross-runtime operations.
- **Transaction receipts**: when the real EVM tx cannot be located (timeout), the fallback synthetic receipt is now enriched with `transactionIndex`, `effectiveGasPrice`, realistic `gasUsed` (`0x5208`), and EIP-1559 type so ethers.js/viem don't reject it.
- **Nonce**: `eth_getTransactionCount` now proxies to Tezlink instead of returning hardcoded `0x0`.

---

## [0.2.0] — 2026-04-15

### Added
- Chrome/Brave/Firefox MV3 extension (`extension/`) — replaces Tampermonkey as the recommended injection method
- Popup UI listing connected sites with origin, EVM alias, tz1 address, and chain badge
- Persistent session tracking via `chrome.storage.local` (survives service worker restarts)
- First-run onboarding guide in the popup (Temple install + network setup)
- TESTNET badge in the popup header
- `npm run build:ext` and `npm run dev:ext` scripts

### Fixed
- Session origin spoofing via postMessage: content script now uses `window.location.origin` (browser-trusted), never the page-controlled message payload
- "Disconnect" button now propagates to the page and actually calls `wallet_revokePermissions` — previous behaviour only removed the session from the popup UI
- Race condition in the service worker: message handling is now serialized behind the storage-load promise, preventing silent session loss on startup
- `chrome.storage.local.set` is now awaited in `persist()` to avoid write loss when the SW is killed mid-operation

### Changed
- Popup UI language changed to English (was mixed FR/EN)
- `eth_call` now routed via Tezlink proxy (was planned for 0.2.0, now shipped)

---

## [0.1.0] — 2026-03-24

### Added
- EIP-1193 provider (`window.ethereum`) injected at runtime via IIFE bundle
- EIP-6963 multi-wallet discovery — announces the relayer to dApps using RainbowKit, wagmi, etc.
- Temple Wallet connection via Beacon SDK (`eth_requestAccounts`)
- Transaction routing through NAC gateway (`callMichelson` entrypoint)
- Supported EIP-1193 methods: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `net_version`, `eth_getBalance`, `eth_getTransactionCount`, `eth_sendTransaction`, `eth_getTransactionReceipt`
- tz1 → EVM alias derivation via `tez_getEthereumTezosAddress` RPC
- Tampermonkey userscript injection guide (inline bundle for EIP-6963 timing)
- Docker Compose setup for local development
- Docusaurus documentation site with architecture diagrams, API reference, and user flows
- GitLab CI pipeline deploying docs to GitLab Pages
- Playground frontend (Next.js) for manual testing: connect, transfer, Counter contract interactions

### Known limitations
- `eth_call` not implemented in the relayer (read-only calls must go directly to Tezlink RPC)
- `eth_sign`, `personal_sign`, EIP-712 not supported (SIWE out of scope for V1)
- Nonce management not implemented (`eth_getTransactionCount` returns `0x0`)

---

## Upcoming

### [0.3.0] — planned
- `personal_sign` support (SIWE / EIP-4361, requires kernel ERC-1271)
- `eth_signTypedData` support (EIP-712)
- Gas estimation via `eth_estimateGas` before transaction submission