# Changelog

All notable changes to the Tezos X Relayer are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.5.5] — 2026-06-04

Ships alongside `@tezosx/wallet` 0.11.3.

### Fixed
- **`findRealHash` now accepts the kernel's sender-side bookkeeping tx as a match.** When the user's `eth_sendTransaction` destination is the EVM-encoded form of a Tezos L1 entity (a KT1, or another tz1's alias), the kernel routes the value via L1 and emits a bookkeeping EVM tx whose `to` is the sender's own alias — not the user-typed destination. 0.5.4's predicate matched only on `tx.to === destination`, which missed this case and left the resolver looping until timeout. The predicate is now `tx.value === expected AND tx.to ∈ {destination, senderAlias}`, covering both the direct-EVM and L1-routed shapes.

### Changed
- **`FindRealHashTarget`** gains a required `senderAlias: string` field. Callers (only `RelayerProvider.resolveRealHash` known) must pass it; the previous `{ to, value }` shape is not source-compatible.

### Compatibility
- **Breaking on the `findRealHash` public surface** (one new required argument). Internal-only as far as we know.

---

## [0.5.4] — 2026-06-04

Ships alongside `@tezosx/wallet` 0.11.2.

### Fixed
- **`findRealHash` now correlates cross-runtime tz1 → 0x bare transfers correctly.** The previous predicate filtered candidate EVM txs on `from === alias` (the EVM derivation of the originating tz1). On Tezos X Previewnet the kernel synthesizes these txs with `from = 0x7e20580000000000000000000000000000000001` (a constant system address) and the originating tz1's alias never appears on the synthesized tx — so the matcher would scan blocks indefinitely without finding a candidate, the resolver would time out, and the wallet UI would never transition past "broadcasting". The matcher is rebuilt around the only fields the kernel carries forward intact from the original `eth_sendTransaction` request: the destination (`to`) and the value (`value` in wei).

### Changed
- **`findRealHash` signature.** Now takes `{ to: string; value: string }` (the original tx's destination + wei value) instead of a single `alias: string`. Per-block candidates that share the predicate are still sorted by nonce ascending so concurrent syntheses claim their txs in submission order; `claimedHashes` semantics are unchanged.
- **`EvmTxSummary`** gains an optional `value?: string` field (0x-prefixed wei) so the matcher can disambiguate concurrent pendings targeting the same destination.
- **`PendingOp`** in `RelayerProvider` gains a `value: string` field captured at submission time and passed to `findRealHash`.

### Compatibility
- **Breaking on the `findRealHash` public surface** (one renamed argument). Internal-only as far as we know — only `RelayerProvider.resolveRealHash` in this package consumes it. Third-party consumers should update the call.
- No change to `RelayerProvider`'s EIP-1193 surface, no change to op submission semantics.

---

## [0.5.3] — 2026-06-02

Ships alongside `@tezosx/wallet` 0.11.0.

### Changed
- **`findRealHash` now correlates kernel-synthesized EVM txs by `from === alias` plus nonce ordering**, instead of the previous `from || to === alias` predicate. With two concurrent cross-runtime ops to/from the same alias, the prior matcher could attach the wrong real EVM hash to the wrong synthetic hash; the new matcher filters strictly on `from`, sorts per-block candidates by nonce ascending, and claims the lowest un-claimed one. `EvmTxSummary` gains an optional `nonce` field. (Persisting `claimedHashes` across `RelayerProvider` restarts is queued for a follow-up.)

### Removed
- **Remote 4byte.directory selector lookup in [`buildTezosToEvmCall`](src/use-cases/build-tezos-to-evm-call.ts).** Selectors are now resolved against the local `KNOWN_SIGNATURES` allow-list (14 entries covering ERC-20 + NAC entrypoints) — unknown selectors throw `UnknownSelectorError`. The function is now sync internally; `buildTezosToEvmCall` itself remains async for public-API stability.

### Added
- **`UnknownSelectorError`** and **`SubMutezPrecisionError`** (`src/use-cases/build-tezos-to-evm-call.ts`), exported from `@tezosx/relayer/tezos`. The first replaces the silent "fall back to raw selector hex" behaviour; the second guards against wei values whose `% 10^12` remainder would be silently floor-divided to mutez. Both are translated to EIP-1193 `-32602` by `RelayerProvider`.

### Compatibility
- **`buildTezosToEvmCall` may now throw** on unknown selectors and sub-mutez wei amounts where it previously fell through to a malformed call or a silent truncation. Callers in `RelayerProvider` already catch and translate. Third-party SDK consumers using the pure helper directly should add the same translation.
- **`buildSyntheticReceipt` remains removed** (deleted in 0.5.2); `l1OpHashToEvmHash` stays.

---

## [0.5.2] — 2026-06-02

Security patch. Closes audit C3 (the only Critical-rated finding in the 2026-06-01 security audit). Ships alongside `@tezosx/wallet` 0.10.2.

### Security
- **`eth_getTransactionReceipt` no longer fabricates a `status: 0x1` receipt for unresolved cross-runtime transactions (audit C3).** When the real EVM hash of a tz1 → 0x cross-runtime op could not be resolved within the polling window, [`RelayerProvider.handleGetTransactionReceipt`](src/tezos/provider.ts) previously fell through to `buildSyntheticReceipt(...)` which returned a hardcoded success receipt. A dApp polling the receipt and crediting on `status == 0x1` could be silently mis-credited — there was no real on-chain evidence of the transfer. The provider now returns `null` per the JSON-RPC spec for not-yet-mined transactions; ethers/viem `tx.wait()` continues polling. Pairs with the 0.5.x `eth_getTransactionByHash` fix that returns a pending-tx object instead of `null` so the two methods stay consistent.

### Removed
- **`buildSyntheticReceipt`** export from `@tezosx/relayer/tezos`. Was the only consumer of the forged-success path; no internal callers remain. `l1OpHashToEvmHash` (still used by the wallet's `list-activity` for cross-runtime dedup) stays in [`use-cases/build-synthetic-receipt.ts`](src/use-cases/build-synthetic-receipt.ts) — the file name is now slightly historical but the rename can ride a future cleanup.

### Compatibility
- **No public API removed besides `buildSyntheticReceipt`.** No third-party SDK consumer is known to use that export; the function was internal to the wallet's relayer path. The wallet 0.10.2 pin (`^0.5.0`) picks up this patch automatically.
- **dApp polling behaviour.** dApps using ethers/viem `tx.wait()` were already tolerant of `null` receipts (they're EIP-1474-compliant). dApps that strict-checked `status === '0x1'` against a synthetic receipt to credit users were, by definition, vulnerable to the bug — this patch closes that path; they will now correctly wait for a real receipt.

---

## [0.5.1] — 2026-05-19

### Added
- **`RelayerProvider.listPendingOps()`** — read-only snapshot of pending L1→L2 ops (broadcast against the NAC gateway, kernel-synthesized EVM hash not yet resolved). Returns a `readonly PendingOpView[]` with `l1OpHash`, `evmAlias`, `to`, `fromBlock`, `broadcastedAt`. Consumed by the wallet 0.8.0 Activity tab to surface "EVM effect pending" rows before TzKT or Blockscout sees the op. The internal `PendingOp` struct is unchanged in shape; a `broadcastedAt: number` field is now captured at submission time for the public view.
- **`PendingOpView`** type under `domain/cross-runtime.ts`, re-exported from `@tezosx/relayer/tezos` and `@tezosx/relayer/types`.

### Compatibility
- Additive only. Wallet 0.7.0 and existing third-party consumers build unchanged against this release.

---

## [0.5.0] — 2026-05-12

### Added
- **New named entry points** alongside the existing per-file paths:
  - `@tezosx/relayer/tezos` — curated public surface for Tezos-consumer wallets: `RelayerProvider`, `BeaconClient`, `TezlinkClient`, plus the use-case helpers `buildTezosToEvmCall`, `deriveEvmAlias`, `resolveTezosAddress`.
  - `@tezosx/relayer/evm` — public surface for EVM-consumer wallets: `encodeNacTransfer`, `encodeNacCallMichelson`, `buildCrossRuntimeTx` (high-level builder taking a `CrossRuntimeIntent` + `fromAddress` + `TransportPort`), `buildEvmToTezosCall` (pure use case), the async-iterable `trackCrossRuntimeStatus`, and the `NAC_PRECOMPILE_ADDR` and `NAC_RECOMMENDED_GAS` constants.
  - `@tezosx/relayer/types` — type hub re-exporting the entire `src/domain/` and `src/ports/` layers.
- **Use cases as pure functions** under `src/use-cases/`: `derive-alias`, `resolve-synthetic-hash`, `build-synthetic-receipt`, `build-tezos-to-evm-call`, `build-evm-to-tezos-call`, `track-cross-runtime-status`. Each takes its dependencies as parameters (ports/transports) and is testable in isolation.
- **`TransportPort` and `JsonRpcTransport` interfaces** under `src/ports/transport.ts` — minimal abstractions for the Tezlink EVM RPC and Tezos L1 RPC channels, consumed by the EVM-side builders and the cross-runtime status tracker.
- **Domain layer** under `src/domain/` carrying every runtime-agnostic type and error class: `CrossRuntimeIntent`, `CrossRuntimeCall` (union of `GatewayCall` and `PrecompileCall`), `CrossRuntimeDirection`, `CrossTxStatus`, `RuntimeId`, `ChainConfig`, `AliasMapping`, `RelayerError` and its subtypes `GatewayError` and `PrecompileError`. The EIP-1193 surface types (`RequestArguments`, `ProviderRpcError`, `ProviderConnectInfo`, `EIP1193Provider`) and the Ethereum-tx types (`EthTransactionRequest`, `EthTransactionReceipt`) now also live in `src/domain/`.
- **README** for the package describing both consumer modes, the public surface map, and the source layout.

### Changed
- **Internal reorganisation toward clean architecture** (no behaviour change). `src/` is now split into `domain/`, `ports/`, `use-cases/`, `shared/`, `tezos/`, `evm/`, plus the existing `polyfills/`. The bare `index.ts` IIFE entry script still auto-injects `window.ethereum` exactly as before.
- **`GatewayBuilder` (class) replaced by `buildTezosToEvmCall` (pure async function)** returning the new domain `GatewayCall` type, which carries `direction: 'michelson-to-evm'`, `contractAddr`, `entrypoint: 'default' | 'call_evm'`, and `mutezAmount: bigint`. The `RelayerProvider` internally calls the new function and converts `mutezAmount.toString()` at the beacon call site — the `ITezosWalletClient` interface still takes a string mutez amount, so consumer wallets need no change.
- **Constants moved from `src/constants.ts` into `src/shared/constants.ts`**. The `@tezosx/relayer/constants` exports map entry now resolves to the new home unchanged; the legacy `src/constants.ts` is removed.
- **Cross-cutting helpers moved from `src/utils/` into `src/shared/`** (hex, async, rpc) and `src/use-cases/` (derive, resolver, receipt). `src/utils/` is gone; the `@tezosx/relayer/utils/derive` exports map entry redirects to `src/use-cases/derive-alias.ts` so the wallet's existing import keeps working.
- **Tezos-consumer source files relocated** out of the bare `src/` directory: `provider.ts`, `beacon.ts`, `tezlink.ts` moved into `src/tezos/` and `wallet-client.ts` moved into `src/ports/tezos-wallet-client.ts`. The exports map redirects `./provider`, `./wallet-client`, `./tezlink` to the new homes; consumers see no change.
- **`src/types.ts` dismantled**: EIP-1193 types moved to `src/domain/eip-1193.ts`, Ethereum-tx types to `src/domain/eth-tx.ts`, `RelayerSession` and `PendingOp` inlined as private interfaces inside `src/tezos/provider.ts`, `BeaconPermissions` consolidated into `WalletPermissions` (the two were structurally identical). The `@tezosx/relayer/types` exports map entry redirects to `src/domain/index.ts`, which re-exports everything in `domain/` plus the port interfaces.

### Removed
- **`src/gateway.ts`** (replaced by `src/use-cases/build-tezos-to-evm-call.ts`).
- **`src/constants.ts`** and **`src/utils/{hex,async,rpc,derive,resolver,receipt}.ts`** — content relocated to `src/shared/` or `src/use-cases/`.
- **`src/types.ts`** — content relocated to `src/domain/` (see Changed).
- **`./gateway` exports map entry** — no external consumer; internal callers use the use case.
- **`./utils/*` wildcard exports map entry** — replaced by a specific `./utils/derive` entry redirecting to the use case (only utility path the wallet still imports).
- **`BeaconPermissions` interface** — collapsed into the structurally identical `WalletPermissions` exported from `src/ports/tezos-wallet-client.ts`.

### Compatibility
- **Wallet 0.6.0 builds and runs unchanged.** Every existing wallet import — `@tezosx/relayer/{provider,wallet-client,tezlink,constants,types,utils/derive}` — resolves to the new home via the exports map. No shim files; only redirects.
- **The injected `window.ethereum` runtime surface is unchanged.** Same EIP-1193 methods, same return shapes, same synthetic-hash → real-hash resolution flow.
- The IIFE bundle (`dist/relayer.iife.js`) and the Chrome MV3 extension under `extension/` are unaffected by the source reorganisation.
- Kernel requirement unchanged from 0.4.0 (Previewnet, the 4-field `call_evm` signature).

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