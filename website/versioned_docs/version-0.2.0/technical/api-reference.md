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
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
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

### `eth_chainId`

Returns the Tezos X chain ID as a hex string.

```js
const chainId = await window.ethereum.request({ method: 'eth_chainId' });
// → '0x...'
```

---

### `eth_getBalance`

Returns the balance of an address in wei (as hex).

```js
const balance = await window.ethereum.request({
  method: 'eth_getBalance',
  params: ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2', 'latest']
});
// → '0xde0b6b3a7640000'  (1 tez = 1e18)
```

---

### `eth_sendTransaction`

Routes a transaction through the NAC gateway. Opens Temple for signature.

```js
const txHash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    from: '0x341af4de...',
    to: '0xRecipient...',
    value: '0xde0b6b3a7640000',   // 1 tez in wei
    data: '0x',                    // empty for native transfer
    gas: '0x5208',
  }]
});
```

**With contract calldata:**

```js
// increment() on Counter contract
await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    to: '0x7b0e325FF8F70d21891A7494B5715C6dC3d08D7b',
    data: '0xd09de08a',   // increment() selector
    gas: '0x186a0',
  }]
});
```

---

### `wallet_revokePermissions`

Disconnects the Temple session.

```js
await window.ethereum.request({ method: 'wallet_revokePermissions' });
```

## Events

```js
// Account change
window.ethereum.on('accountsChanged', (accounts) => {
  console.log('New account:', accounts[0]);
});

// Chain change
window.ethereum.on('chainChanged', (chainId) => {
  console.log('New chain:', chainId);
});
```

## Not supported

| Method | Reason |
|---|---|
| `eth_sign` | SIWE out of scope for V1 |
| `personal_sign` | Out of scope for V1 |
| `eth_signTypedData_v4` | EIP-712 out of scope for V1 |
| `eth_call` | Not yet implemented |
