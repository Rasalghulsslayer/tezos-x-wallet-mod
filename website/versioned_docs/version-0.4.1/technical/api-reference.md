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

---

### `eth_getTransactionByHash`

Resolves the real kernel-synthesized EVM transaction when called with a
synthetic hash returned by `eth_sendTransaction`. Falls back to a Tezlink
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
scanning EVM blocks from the send-time snapshot onward. Returns a synthetic
receipt after timeout if nothing matches.

```js
await window.ethereum.request({
  method: 'eth_getTransactionReceipt',
  params: [syntheticHash]
});
```

---

### `wallet_revokePermissions` / `wallet_disconnect`

Disconnects the Temple session and clears all pending op mappings.

```js
await window.ethereum.request({ method: 'wallet_revokePermissions' });
```

---

### Fee model methods (short-circuited)

Tezos X fees are paid on the **Michelson runtime** via the NAC gateway, not
on the EVM runtime. Proxying EVM fee calls to the Tezlink node therefore
returns values that cannot be coalesced into a coherent fee model by
client libraries (ethers.js v6 throws `could not coalesce error` when it
tries to assemble these for `BrowserProvider.populate`).

To keep EVM clients happy during transaction population, the relayer
short-circuits these methods to fixed, well-formed constants:

| Method | Returns | Rationale |
|---|---|---|
| `eth_estimateGas` | `0x1e8480` (2 000 000 gas) | Conservative upper bound. Actual fees are paid in tez on L1 — the gas figure is cosmetic. |
| `eth_gasPrice` | `0x0` | No EVM-side gas price — fees come from the L1 operation. |
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

## Events

```js
window.ethereum.on('accountsChanged', (accounts) => { /* ... */ });
window.ethereum.on('chainChanged',    (chainId)  => { /* ... */ });
window.ethereum.on('connect',         (info)     => { /* { chainId } */ });
window.ethereum.on('disconnect',      (err)      => { /* EIP-1193 error */ });
```

## Not supported

| Method | Reason |
|---|---|
| `eth_sign` | Out of scope for V1 |
| `personal_sign` | SIWE / EIP-4361 — requires kernel ERC-1271 (planned 0.4.0) |
| `eth_signTypedData` / `_v3` / `_v4` | EIP-712 — out of scope for V1 |
