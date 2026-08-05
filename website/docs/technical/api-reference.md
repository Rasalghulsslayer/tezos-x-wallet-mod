---
id: api-reference
title: API Reference
sidebar_position: 4
---

# API Reference

## `window.ethereum.request()`

All interactions go through the standard EIP-1193 `request` method:

```ts
window.ethereum.request({ method: string, params?: unknown[] }): Promise<unknown>
```

## Methods

### `eth_requestAccounts`

Opens Temple wallet via Beacon and returns the EVM alias for the connected tz1 address.

```js
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
// → ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2']
```

---

### `eth_accounts`

Returns the currently connected account without prompting.

```js
const accounts = await window.ethereum.request({ method: 'eth_accounts' });
// → ['0x341af4de...'] or []
```

---

### `tez_getAccounts`

Non-standard, Tezos X-specific: returns the connected **tz1** address (the
Tezos account behind the EVM alias), or `[]` when no session is active.

```js
await window.ethereum.request({ method: 'tez_getAccounts' });
// → ['tz1...'] or []
```

---

### `eth_chainId` / `net_version`

Chain ID as hex (`eth_chainId`) or decimal string (`net_version`).

```js
await window.ethereum.request({ method: 'eth_chainId' });    // → '0x1f440'
await window.ethereum.request({ method: 'net_version' });    // → '128064'
```

---

### `eth_getBalance`

Returns the balance of an address in wei (as hex). Proxied to Tezlink.

```js
await window.ethereum.request({
  method: 'eth_getBalance',
  params: ['0x341af4de...', 'latest']
});
```

---

### `eth_getTransactionCount`

Returns the current nonce for an address. Proxied to Tezlink.

```js
await window.ethereum.request({
  method: 'eth_getTransactionCount',
  params: ['0x341af4de...', 'latest']
});
```

---

### `eth_call`

Read-only call against an EVM contract. Proxied to Tezlink.

```js
await window.ethereum.request({
  method: 'eth_call',
  params: [{ to: '0x...', data: '0x2e64cec1' }, 'latest']
});
```

---

### `eth_sendTransaction`

Routes a transaction through the NAC gateway. Opens Temple for signature and
returns a **synthetic** hash (the real kernel-synthesized hash is resolved
lazily — see [EIP-1193 → synthetic hash](../architecture/eip1193#transaction-receipts--the-synthetic-hash)).

```js
const syntheticHash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    to: '0x...',
    data: '0xd09de08a',          // e.g. increment() selector
    value: '0x0',
  }]
});
```

Invalid requests are rejected with JSON-RPC error `-32602` **before any
signing popup opens** — see [Typed errors](#typed-errors).

---

### `eth_getTransactionByHash`

Resolves the real kernel-synthesized EVM transaction when called with a
synthetic hash returned by `eth_sendTransaction`. While the real transaction
has not been found, it returns a pending-shaped transaction object
(`blockNumber: null`) so client pollers keep waiting. Falls back to a Tezlink
proxy for any other hash.

```js
await window.ethereum.request({
  method: 'eth_getTransactionByHash',
  params: [syntheticHash]
});
// → { hash: '0xrealHash', from, to, blockNumber, ... }
```

---

### `eth_getTransactionReceipt`

Resolves the real receipt (with real `logs`, `gasUsed`, `blockNumber`) by
scanning EVM blocks from the send-time snapshot onward. Returns **`null`**
while the kernel-synthesized transaction has not been found yet — the
standard JSON-RPC answer for a not-yet-mined transaction.

```js
await window.ethereum.request({
  method: 'eth_getTransactionReceipt',
  params: [syntheticHash]
});
```

---

### `wallet_revokePermissions` / `wallet_disconnect`

Disconnects the Temple session and clears all pending op mappings (including
the persisted ones when a `PendingOpsStore` is attached).

```js
await window.ethereum.request({ method: 'wallet_revokePermissions' });
```

---

### Fee model methods (short-circuited)

Tezos X fees for relayer-routed transactions are paid in tez on the
**Michelson runtime** via the NAC gateway, not in EVM gas. Proxying EVM fee
calls to the Tezlink node therefore returns values that cannot be coalesced
into a coherent fee model by client libraries (ethers.js v6 throws
`could not coalesce error` when it tries to assemble these for
`BrowserProvider.populate`).

To keep EVM clients happy during transaction population, the relayer
short-circuits these methods to fixed, well-formed constants:

| Method | Returns | Rationale |
|---|---|---|
| `eth_estimateGas` | `0x1e8480` (2 000 000 gas) | Conservative upper bound. Actual fees are paid in tez on the Michelson runtime — the gas figure is cosmetic. |
| `eth_gasPrice` | `0x0` | No EVM-side gas price — fees come from the Michelson operation. |
| `eth_maxPriorityFeePerGas` | `0x0` | EIP-1559 priority fee is not applicable. |
| `eth_feeHistory` | `{ oldestBlock: '0x0', baseFeePerGas: ['0x0'], gasUsedRatio: [0], reward: [['0x0']] }` | Minimal valid envelope. |

### RPC proxy (fallback)

Any JSON-RPC method **not listed above** (and not in the fee-model table)
is forwarded transparently to the Tezlink EVM node. This unblocks
ethers.js `tx.wait()`, viem, wagmi and any other library that relies on
methods like `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`,
`eth_getLogs`, etc.

```js
await window.ethereum.request({ method: 'eth_blockNumber' });
await window.ethereum.request({
  method: 'eth_getLogs',
  params: [{ address: '0x...', fromBlock: '0x0', toBlock: 'latest' }]
});
```

## Provider construction (SDK consumers)

Wallet hosts and SDK consumers instantiate the provider directly from
`@tezosx/relayer/tezos`:

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';

// Temple/Beacon-backed (what the extension does)
const provider = new RelayerProvider(new BeaconClient());

// Custom wallet backend + optional persistence
const provider = new RelayerProvider(walletClient, pendingOpsStore);
```

- **`walletClient`** — any implementation of `ITezosWalletClient`. The
  standalone TezosX Wallet passes its own `TezosSigner` from
  `@tezosx/wallet-core`.
- **`pendingOpsStore`** *(optional, since 0.7.0)* — a `PendingOpsStore`
  implementation providing per-account persistence for cross-runtime
  resolution state, so a synthetic hash stays resolvable across lock,
  account switch, or service-worker eviction. Omit it for an
  in-memory-only provider (SDK usage, tests).

### Wallet-host methods

Beyond `request()`, the provider exposes methods for wallet UIs:

| Method | Returns | Purpose |
|---|---|---|
| `resolveSyntheticHash(hash)` | `Promise<string \| null>` | Awaits the kernel-synthesized real EVM hash for a synthetic hash; `null` on timeout (~30 s per attempt: 15 retries × 2 s) |
| `getPendingL1Hash(hash)` | `string \| null` | The underlying Michelson operation hash (`o…`) for a synthetic hash |
| `listPendingOps()` | `readonly PendingOpView[]` | Snapshot of broadcast cross-runtime ops the kernel has not yet resolved — used by the wallet's Activity page |

## Typed errors

`eth_sendTransaction` validates the request with `buildTezosToEvmCall` before
opening any signing popup. Three typed errors are thrown by the builder and
surfaced to the dApp as JSON-RPC error **`-32602`** (invalid params):

| Error | Trigger |
|---|---|
| `UnknownSelectorError` | The calldata's 4-byte selector is not in the curated allow-list — see [Selector resolution](../architecture/nac-gateway#selector-resolution) |
| `SubMutezPrecisionError` | The wei `value` is not divisible by 10¹² (1 mutez) — the sub-mutez remainder would be silently lost, so the transaction is rejected instead |
| `InvalidDestinationError` | `to` is not a canonical `0x` + 40-hex address — the destination is embedded verbatim in the signed payload, so arbitrary strings are rejected before signing |

All three classes (and `weiToMutezExact`, which implements the
no-silent-floor rule) are exported from `@tezosx/relayer/tezos` so consumers
can catch them by `instanceof`.

## Events

```js
window.ethereum.on('accountsChanged', (accounts) => { /* ... */ });
window.ethereum.on('chainChanged',    (chainId)  => { /* ... */ });
window.ethereum.on('connect',         (info)     => { /* { chainId } */ });
window.ethereum.on('disconnect',      (err)      => { /* EIP-1193 error */ });
```

## Not supported

The following methods are rejected with EIP-1193 error code **`4200`**
(unsupported method):

| Method | Reason |
|---|---|
| `eth_sign` | No ECDSA key behind the `0x` alias — message signing is not supported |
| `personal_sign` | Same — SIWE / EIP-4361 flows cannot be completed with this provider |
| `eth_signTypedData` / `_v3` / `_v4` | EIP-712 signing is not supported |

## Constants ownership

The relayer package only owns the kernel-level constants: the Previewnet RPC
endpoints, the NAC gateway address (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`),
the NAC precompile address, and the recommended gas budgets
(`@tezosx/relayer/constants`). The chain ID, explorer URLs, TzKT API base and
other wallet-level constants live in `@tezosx/wallet-core`, not in the
relayer.

## See also

- [EIP-1193 provider](../architecture/eip1193) — method table and the synthetic-hash lifecycle
- [EVM entry point](./evm-entry) — the `@tezosx/relayer/evm` surface for EVM-native consumers
- [Transfer flow](../user-flows/transfer) and [Smart contract call flow](../user-flows/smart-contract-call)
