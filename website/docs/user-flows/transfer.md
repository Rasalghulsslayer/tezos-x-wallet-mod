---
id: transfer
title: Transfer
sidebar_position: 2
---

# Native Transfer Flow

Send XTZ from your tz1 alias to any Tezos address.

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant dApp
    participant Relayer
    participant Gateway as NAC Gateway
    participant Temple

    dApp->>Relayer: eth_sendTransaction({ to, value })
    Relayer->>Relayer: Build Micheline (call entrypoint, HTTP %call)
    Relayer->>Temple: Sign L1 operation
    Temple->>User: Confirm transaction
    User->>Temple: Sign
    Temple->>Gateway: L1 operation → call(http://ethereum/&lt;0x&gt;, …)
    Gateway->>Gateway: Forward XTZ transfer
    Relayer->>dApp: tx hash
```

## Example

```js
await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    from: '0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2',
    to: '0xRecipientAlias...',
    value: '0xde0b6b3a7640000', // 1 tez
  }]
});
```

## Value encoding

Tezos uses mutez (1 tez = 1,000,000 mutez). The relayer converts wei → mutez internally:

| Wei (hex) | Tez |
|---|---|
| `0xde0b6b3a7640000` | 1 tez |
| `0x6f05b59d3b20000` | 0.5 tez |
| `0x2386f26fc10000` | 0.01 tez |
