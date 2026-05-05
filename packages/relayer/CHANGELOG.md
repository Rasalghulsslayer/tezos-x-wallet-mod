# Changelog

All notable changes to the Tezos X Relayer are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.4.1] — 2026-05-05

### Added
- **Public hash resolution APIs** on `RelayerProvider` so wallet UIs can wait for the kernel-synthesized real EVM hash before showing transaction results, instead of displaying a synthetic placeholder.
  - `resolveSyntheticHash(syntheticHash): Promise<string | null>` — public façade over the internal `resolveRealHash`. Returns the real EVM hash, or `null` on resolver timeout.
  - `getPendingL1Hash(syntheticHash): string | null` — read-only access to the underlying L1 op hash for a synthetic NAC hash.

### Compatibility
- No breaking change. The previous behaviour (synthetic hash returned by `eth_sendTransaction`, real hash transparently swapped during `eth_getTransactionByHash` / `Receipt`) is unchanged. The new methods are additive and only consumed by the wallet's `SEND_TX` flow today.

---

## [0.4.0] — 2026-05-04

### Changed (breaking — default network)
- **Default network migrated from `testnet` (`demo.txpark.nomadic-labs.com`) to Tezos X Previewnet.** New endpoint defaults baked into `src/constants.ts`:
  - `TEZLINK_EVM_RPC` → `https://evm.previewnet.tezosx.nomadic-labs.com`
  - `TEZOS_L1_RPC`    → `https://michelson.previewnet.tezosx.nomadic-labs.com` (note: on Previewnet the Michelson RPC is the host root — **no `/rpc/tezlink` suffix**)
- Browser extension `host_permissions` updated to grant access to the two Previewnet hosts only (the deprecated `demo.txpark` host is removed).
- Extension popup chain-name table now resolves chain ID `128064` (`0x1f440`) to **Tezos X Previewnet**. The old `127124` (`0x1f094`) testnet label is gone.

### Compatibility
- Kernel requirement unchanged from 0.3.0 (the new 4-field `call_evm` signature introduced in 0.2.2).

---

## [0.3.0] — 2026-04-24

### Changed
- **Monorepo restructure**: the relayer moved from the repository root to `packages/relayer/`. The package is now published as `@tezosx/relayer`. Workspace scripts (`npm -w @tezosx/relayer ...`) are the supported way to build the relayer and its browser extension. The injected `window.ethereum` surface is identical to 0.2.2 — no dApp-facing breaking change.

### Fixed
- **Fee-model methods**: `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas` and `eth_feeHistory` are now short-circuited to fixed constants instead of being proxied to the Tezlink EVM node. Fees on Tezos X are paid on the Michelson runtime via the NAC gateway, so EVM-side fee figures are irrelevant and the proxied values were producing responses that ethers.js v6 could not coalesce into a usable fee model (triggered `could not coalesce error` on `BrowserProvider.populate`). `eth_estimateGas` returns `0x1e8480` (2M gas), `eth_gasPrice` / `eth_maxPriorityFeePerGas` return `0x0`, `eth_feeHistory` returns a minimal well-formed envelope.
- **Selector resolution**: the local `KNOWN_SIGNATURES` registry used by `GatewayBuilder.fromEthTransaction` now ships standard ERC-20 and common DeFi selectors (`transfer`, `approve`, `transferFrom`, `balanceOf`, `allowance`, `totalSupply`, `decimals`, `deposit(uint256)`, `deposit()`, `withdraw(uint256)`, `withdraw()`, `claim()`, `unstake(uint256)`). Previously these fell through to 4byte.directory, whose `results[0]` can return a colliding signature for common 4-byte prefixes, causing the NAC gateway to recompute a different selector and the target contract to reject the call.
- Gateway now logs the resolved `selector → methodSig` mapping for each `call_evm` build, simplifying diagnosis of selector lookup issues.

### Compatibility
- No breaking changes vs. 0.2.2. Kernel requirements unchanged.

---

## [0.2.2] — 2026-04-23

### Changed (breaking — matches kernel hard reset)
- **`call_evm` entrypoint signature**: migrated to the new Michelson shape `pair string (pair string (pair bytes (option (contract bytes))))`. The 4th field is an optional Michelson callback invoked by the kernel after the EVM call completes.
- **`GatewayBuilder.fromEthTransaction`**: now accepts an optional 2nd argument `callback` (default `{ prim: 'None' }`) to let advanced callers supply a Michelson callback. Relayer default behavior is unchanged — all transactions pass `None`.

### Compatibility
- Only works against kernels deployed **on or after 2026-04-22** (demo, previewnet). Previous kernels expected the legacy 3-field signature and will reject calls from 0.2.2+.

---

## [0.2.1] — 2026-04-22

### Added
- **Real EVM transaction resolution**: both `eth_getTransactionByHash` and `eth_getTransactionReceipt` now map the synthetic NAC hash back to the actual kernel-synthesized EVM transaction. The resolver scans EVM blocks from send-time snapshot onward and matches the first unclaimed tx whose `from` **or** `to` equals the user's alias (the kernel may put the alias on either side). Returns the real tx object / receipt with real `transactionHash`, real `logs`, real `gasUsed`, real `blockNumber`. Unblocks ethers.js `tx.wait()` (which polls `eth_getTransactionByHash` before `eth_getTransactionReceipt`) and event-driven dApps (TzButton, DEX, lending, etc.) that rely on `receipt.logs`.
- **In-flight deduplication**: concurrent callers for the same synthetic hash share a single block-scan promise instead of spawning N concurrent scans. Critical under ethers.js / viem polling load (~1 call/s).
- **Per-session claim set**: once a real hash has been assigned to one pending op, no other pending op can match the same transaction.
- **Diagnostic logs**: the relayer logs each step of the transaction lifecycle (`eth_sendTransaction` → NAC build → `fromBlock` snapshot → L1 signing → synthetic hash → scan → real hash resolved), making dApp integration issues easier to diagnose.
- **Pure-functional resolver** in `src/utils/resolver.ts` (recursive `attemptFind` → `scanRange` → `scanBlock`), with per-block tx summary logs.

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

### [0.4.0] — planned
- `personal_sign` support (SIWE / EIP-4361, requires kernel ERC-1271)
- `eth_signTypedData` support (EIP-712)
- ABI hook so dApps can register their own method signatures (removes the 4byte.directory fallback entirely)