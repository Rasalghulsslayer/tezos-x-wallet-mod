---
id: transfer
title: Transfer
sidebar_position: 2
---

# Native Transfer Flow

Send XTZ from your tz1 account (through its EVM alias) to a `0x` destination on the EVM runtime.

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant dApp
    participant Relayer
    participant Gateway as NAC Gateway
    participant Temple

    dApp->>Relayer: eth_sendTransaction({ to, value })
    Relayer->>Relayer: Build Micheline (%call HTTP entrypoint)
    Relayer->>Temple: Sign Michelson operation
    Temple->>User: Confirm transaction
    User->>Temple: Sign
    Temple->>Gateway: operation → call(http://ethereum/&lt;0x&gt;, …)
    Gateway->>Gateway: Forward XTZ transfer
    Relayer->>dApp: synthetic hash
```

The hash returned to the dApp is a **synthetic hash** — the real
kernel-synthesized EVM hash is resolved lazily. See
[EIP-1193 → synthetic hash](../architecture/eip1193#transaction-receipts--the-synthetic-hash).

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

:::caution AliasForwarder — sending to an alias
EVM aliases of Tezos accounts cannot hold native XTZ. If the destination `0x`
address is the alias of a tz1 account, the kernel re-forwards the amount to
the origin tz1 (the *AliasForwarder* mechanism) — the alias's EVM balance
stays at ~0 and the XTZ lands on the underlying tz1. ERC-20 tokens are
different: they live in contract mappings and the alias really holds them.
See [Send XTZ (wallet docs)](/wallet/user-flows/send-xtz) for how the wallet
surfaces this.
:::

## Value encoding

Tezos uses mutez (1 tez = 1,000,000 mutez). The relayer converts wei → mutez internally:

| Wei (hex) | Tez |
|---|---|
| `0xde0b6b3a7640000` | 1 tez |
| `0x6f05b59d3b20000` | 0.5 tez |
| `0x2386f26fc10000` | 0.01 tez |

The conversion is **exact, never floored**: a wei value that is not divisible
by 10¹² (1 mutez) is rejected with `SubMutezPrecisionError` (JSON-RPC
`-32602`) before any signing popup opens, so no sub-mutez remainder can be
silently lost.

## See also

- [Smart contract call flow](./smart-contract-call) — the non-empty-calldata path
- [API Reference](../technical/api-reference) — `eth_sendTransaction` and the typed errors
- [NAC Gateway](../architecture/nac-gateway) — how the `%call` entrypoint is built
