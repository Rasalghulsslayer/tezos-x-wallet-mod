# Tezos X Relayer

Injectable EIP-1193 provider that exposes `window.ethereum` to Etherlink dApps, routing all transactions through Temple Wallet and the Tezos X NAC cross-runtime gateway.

## Build

### From binaries
```bash
npm install
npm run typecheck   # TypeScript type check without compiling
npm run build       # produces dist/relayer.iife.js
```

### With docker
```bash
docker compose up -d
```


## Temple Wallet Setup (prerequisite)

1. Open Temple extension → **Settings** (⚙️) → **Networks** → **Add network**
2. Fill in:
   - **Name**: `TezosX Testnet`
   - **RPC URL**: `https://demo.txpark.nomadic-labs.com/rpc/tezlink`
3. **Switch to this network** in Temple (network selector at the top of the extension)
4. Reload the page **before** injecting the relayer

## Testing via DevTools (browser console)

### 1. Serve the bundle locally

```bash
npm run build
npm run serve
# → http://localhost:8080
```

### 2. Inject the relayer on any page

**Option A — DevTools console** (own page or quick test):

```js
const s = document.createElement('script');
s.src = 'http://localhost:8080/dist/relayer.iife.js';
document.head.prepend(s);
```

**Option B — Tampermonkey (third-party dApps)**

Create a new userscript and paste the full content of `dist/relayer.iife.js` **inline** inside the IIFE:

```js
// ==UserScript==
// @name         TezosX Relayer Injector
// @namespace    tezosx-relayer
// @version      0.3
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  // ── Paste the full content of dist/relayer.iife.js here ──
})();
```

> **Why inline?** dApps using EIP-6963 dispatch `eip6963:requestProvider` at page load. Loading the bundle async (via `GM_xmlhttpRequest` or `script.src`) causes the relayer to arrive too late — the provider is never registered. Inlining guarantees synchronous registration at `document-start`.

Verify the injection worked:

```js
window.ethereum.isTezosXRelayer  // must return true
```

### 3. Connect the wallet

```js
await window.ethereum.request({ method: 'eth_requestAccounts' });
// → Temple popup opens
// → Expected for bootstrap1: ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2']
```

### 4. Check the network

```js
await window.ethereum.request({ method: 'eth_chainId' });
// → '0x1f094'  (127124 = Tezos X Testnet)

await window.ethereum.request({ method: 'net_version' });
// → '127124'
```

### 5. Check balance

```js
await window.ethereum.request({
  method: 'eth_getBalance',
  params: ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2', 'latest']
});
// → balance in hex wei
```

### 6. Send a transaction (simple transfer)

```js
const hash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    to: '0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2',  // bootstrap1 EVM alias
    value: '0xDE0B6B3A7640000',  // 1 tez in wei
  }]
});
console.log('TxHash:', hash);
// → 32-byte synthetic hash (keccak256 of the L1 opHash)
```

Temple opens a signing popup. The transaction goes through the NAC gateway (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`, entrypoint `default`).

### 7. Get the receipt

```js
await window.ethereum.request({
  method: 'eth_getTransactionReceipt',
  params: [hash]
});
// → { status: '0x1', transactionHash: hash, ... }
```

### 8. Contract call with calldata

Example with a deployed `Counter` contract at `0x7b0e325FF8F70d21891A7494B5715C6dC3d08D7b`:

```js
// Call increment() — selector 0xd09de08a
const hash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    to: '0x7b0e325FF8F70d21891A7494B5715C6dC3d08D7b',
    data: '0xd09de08a',  // increment()
    value: '0x0',
  }]
});
console.log('TxHash:', hash);
// The relayer resolves 0xd09de08a → "increment()" via 4byte.directory
// then calls NAC entrypoint `call` with Pair(dest, Pair("increment()", bytes("")))
```

Verify the state change by calling `retrieve()` (read-only, no wallet needed):

```js
await fetch('https://demo.txpark.nomadic-labs.com/rpc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to: '0x7b0e325FF8F70d21891A7494B5715C6dC3d08D7b', data: '0x2e64cec1' }, 'latest']
    // 0x2e64cec1 = retrieve()
  })
}).then(r => r.json()).then(r => console.log('counter value:', parseInt(r.result, 16)));
// → 2 after one increment (initial value is 1)
```

### 9. Disconnect the wallet

```js
await window.ethereum.request({ method: 'wallet_revokePermissions' });
// Clears the session and the Beacon active account.
// The next eth_requestAccounts call will reopen the Temple popup.
```

## Bootstrap accounts (testnet only)

| Tezos tz1 | Derived EVM alias |
|---|---|
| `tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx` | `0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2` |

Derivation is performed via the Tezos X RPC `tez_getTezosEthereumAddress` — no hardcoded mapping.

## Infrastructure

| Endpoint | URL |
|---|---|
| EVM RPC (Tezlink) | `https://demo.txpark.nomadic-labs.com/rpc` |
| Tezos L1 RPC | `https://demo.txpark.nomadic-labs.com/rpc/tezlink` |
| NAC Gateway | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` |

## Supported EIP-1193 methods

| Method | Behaviour |
|---|---|
| `eth_requestAccounts` | Opens Temple, derives 0x alias via RPC, returns `[evmAlias]` |
| `eth_accounts` | Returns current session or `[]` |
| `eth_chainId` | Proxied from Tezlink (`0x1f094`) |
| `net_version` | `parseInt(chainId, 16).toString()` |
| `eth_getBalance` | Proxied from Tezlink |
| `eth_getTransactionCount` | Returns `'0x0'` (nonce not managed in V1) |
| `eth_sendTransaction` | Builds NAC Micheline call → Temple popup → synthetic hash |
| `eth_getTransactionReceipt` | Tezlink first, then synthetic receipt from `pendingOps` |
| `eth_sign` / `personal_sign` / EIP-712 | Throws `4200 UNSUPPORTED_METHOD` |

## Out of scope V1

- `eth_sign`, `personal_sign`, EIP-712 (SIWE)
- Chrome/Firefox extension packaging
- Kukai / Umami support
- Real nonce management
- Custom confirmation UI
