---
id: provider
title: RelayerProvider
---

# `RelayerProvider`

The EIP-1193 provider a tz1-backed consumer exposes to EVM code. One class,
two responsibilities: route standard `request()` calls (signing them
Michelson-side through the wallet client), and manage the synthetic→real
hash lifecycle of cross-runtime transactions.

## Construction

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';
import type { PendingOpsStore } from '@tezosx/relayer/tezos';

// Temple/Beacon-backed, in-memory only — fine for a page that never reloads
// mid-transaction, and for tests.
const provider = new RelayerProvider(new BeaconClient());

// Any ITezosWalletClient + persistence — what the Tezos X Wallet does.
const persistent = new RelayerProvider(walletClient, pendingOpsStore);
```

- **`walletClient`** — any [`ITezosWalletClient`](./wallet-clients). The
  Tezos X Wallet passes its own Taquito-backed signer.
- **`pendingOpsStore`** *(optional, since 0.7.0)* — persistence for the
  cross-runtime resolution state; see [the contract](#the-pendingopsstore-contract).

On construction the provider also restores an existing session best-effort
(`getActiveAccount` → alias → chain id) and emits `accountsChanged` +
`connect` with **no user interaction**; offline, the session silently stays
unset and re-establishes on the next request.

## `request()` — the method surface

```ts
provider.request({ method: string, params?: unknown[] }): Promise<unknown>
```

### Session

| Method | Returns | Notes |
|---|---|---|
| `eth_requestAccounts` | `['0xAlias']` | Prompts the backing wallet (Temple via Beacon; the Tezos X Wallet runs its own approval UI). Re-running on an existing session returns it **without re-prompting**. |
| `eth_accounts` | `['0xAlias']` or `[]` | Never prompts. |
| `tez_getAccounts` | `['tz1…']` or `[]` | **Non-standard, Tezos X-specific** — the tz1 behind the alias. Other wallets answer `-32601`; tolerate that. |
| `wallet_revokePermissions` / `wallet_disconnect` | `null` | Ends the session, clears pending-op state (including the persisted store), emits `accountsChanged []` then `disconnect`. |

### Chain and reads

| Method | Returns | Notes |
|---|---|---|
| `eth_chainId` | `'0x1f440'` | Cached on the session. |
| `net_version` | `'128064'` | Decimal form. |
| `eth_getBalance`, `eth_getTransactionCount`, `eth_call` | proxied | Standard shapes; malformed params → `-32602`. |

### Transactions

| Method | Behavior |
|---|---|
| `eth_sendTransaction` | Validates with [`buildTezosToEvmCall`](./cross-runtime#typed-errors) **before any signing prompt** (`-32602` on violation), signs the Michelson operation through the wallet client, returns a **synthetic hash** immediately. Reads only `to`, `value`, `data` — any `gas` field is ignored ([why](../gotchas#fees-and-gas)). No session → `4100` (`Call eth_requestAccounts first`). |
| `eth_getTransactionByHash` | On a tracked synthetic hash: a pending-shaped transaction object (`blockNumber: null`) until resolved — never `null`, so ethers/viem pollers keep polling. Then proxies with the real hash. |
| `eth_getTransactionReceipt` | `null` until the real transaction is found (the standard not-yet-mined answer), then the real receipt — real `logs`, `gasUsed`, `blockNumber`. |

### Fee model (short-circuited constants)

Fees for tz1-routed transactions are paid in mutez on the Michelson runtime —
there is no EVM gas market to sample, so the provider answers fee methods
with fixed, well-formed constants that keep client libraries' fee math
well-defined ([rationale](../gotchas#fees-and-gas)):

| Method | Returns |
|---|---|
| `eth_estimateGas` | `0x1e8480` (2 000 000 — headroom, not consumption) |
| `eth_gasPrice`, `eth_maxPriorityFeePerGas` | `0x0` |
| `eth_feeHistory` | a minimal all-zero envelope |

### Everything else — the proxy

Any other method is forwarded transparently to the EVM node
(`eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_getCode`,
`eth_sendRawTransaction`, …). This is what keeps ethers.js `tx.wait()`, viem
and wagmi functional. The passthrough is **deadline-exempt** (it may carry
writes — aborting after a broadcast is worse than waiting).

### Not supported {#not-supported}

Rejected with EIP-1193 **`4200`**, deliberately before any prompt — the `0x`
alias is not backed by a secp256k1 key, so recovery-based signature
verification can never match ([full rationale](../gotchas#evm-signature-methods-are-rejected-with-4200)):

`eth_sign` · `personal_sign` · `eth_signTypedData` / `_v3` / `_v4`

## Wallet-host methods

Beyond `request()`, three methods serve wallet UIs:

| Method | Returns | Purpose |
|---|---|---|
| `resolveSyntheticHash(hash)` | `Promise<string \| null>` | Awaits the kernel-synthesized real EVM hash. One call = up to **15 scan attempts, 2 s apart** (≥ ~30 s wall clock in total; each attempt rescans from the send-time snapshot block to head). `null` on exhaustion — call again to keep trying. |
| `getPendingL1Hash(hash)` | `string \| null` | The underlying Michelson operation hash (`o…`) — the TzKT fallback link when resolution exhausts. |
| `listPendingOps()` | `readonly PendingOpView[]` | The broadcast cross-runtime operations whose real hash is still unresolved — feeds a wallet's Activity view. |

```ts
const real = await provider.resolveSyntheticHash(syntheticHash);
if (real == null) {
  const opHash = provider.getPendingL1Hash(syntheticHash); // link the user to TzKT
}
```

## The `PendingOpsStore` contract

```ts
import type { PendingOpsStore, PendingOpsSnapshot } from '@tezosx/relayer/tezos';

interface PendingOpsSnapshot {
  ops:     Record<string, PendingOp>;  // keyed by synthetic hash
  claimed: string[];                   // real hashes already claimed (dedup)
}

interface PendingOpsStore {
  load():  Promise<PendingOpsSnapshot | undefined>;
  save(snapshot: PendingOpsSnapshot): Promise<void>;
  clear(): Promise<void>;
}
```

`load()` runs once at construction (rehydration), `save()` after every
mutation (best-effort), `clear()` on disconnect. The data is non-secret;
scope one store per account. Production implementations in the repo:
`packages/wallet/src/adapters/chrome/chrome-pending-ops-store.ts`
(chrome.storage) and `packages/mobile/src/adapters/mmkv-pending-ops-store.ts`
(MMKV) — both ~25 lines.

**Without a store**, resolution state lives only in memory: a reload,
account switch or service-worker eviction mid-resolution leaves the synthetic
hash permanently unresolvable.

## Events

Three events are actually emitted:

| Event | Payload | When |
|---|---|---|
| `accountsChanged` | `string[]` | Session established (connect or the constructor's silent restore), account switched in the backing wallet, or session ended (`[]`) |
| `connect` | `{ chainId }` | Session established |
| `disconnect` | `ProviderRpcError` (code `4100`) | Backing wallet disconnected, or `wallet_revokePermissions` |

`chainChanged` exists on the `EIP1193Provider` type for completeness but is
**never emitted** — the provider is pinned to one chain.

## Timeouts and transport errors {#timeouts-and-transport-errors}

Every read against the EVM node runs under a **15-second deadline**
(`RPC_TIMEOUT_MS`, AbortController-enforced). Three failure shapes:

- **Timeout** — a **plain `Error`**, message
  `Request timed out after 15000ms calling <method>`, **no EIP-1193 code**.
  Deliberate: a timeout is not a transport loss; route it to retry logic, not
  disconnect handling.
- **Transport loss** — failed `fetch` or non-2xx → `ProviderRpcError` code
  **`4900`**.
- **Node error** — rethrown with the node's own `code`/`message`/`data` (the
  only path where `err.data` is populated).

The unknown-method proxy is deadline-exempt (see above). The JSON-RPC helper
implementing this is internal — not part of the exports map.

## Error codes {#error-codes}

| Code | Meaning | Raised when |
|---|---|---|
| `4001` | User rejected | Beacon prompt dismissed; Tezos X Wallet approval rejected |
| `4100` | Unauthorized | No session (`Call eth_requestAccounts first`); wallet locked; also the `disconnect` event payload |
| `4200` | Unsupported method | The five signature methods — [rationale](../gotchas#evm-signature-methods-are-rejected-with-4200) |
| `4900` | Disconnected | Transport loss (failed fetch / non-2xx) |
| `-32601` | Method not found | Unknown to the node too (via the proxy); also `trackCrossRuntimeStatus` on a wrong direction |
| `-32602` | Invalid params | Malformed shapes + the three [typed builder errors](./cross-runtime#typed-errors) |
| `-32603` | Internal | Non-abort wallet-backend failure (e.g. a Beacon failure) |
| `-32005` | Limit exceeded | Tezos X Wallet's per-origin approval cap (wallet-side, not the SDK) |
| *(no code)* | Timeout | See [above](#timeouts-and-transport-errors) |
