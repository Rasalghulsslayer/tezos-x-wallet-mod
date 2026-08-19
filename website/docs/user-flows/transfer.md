---
id: transfer
title: Transfer
sidebar_position: 2
---

# Native Transfer Flow

Send XTZ from your tz1 account (through its EVM alias) to a `0x` destination
on the EVM runtime. A transaction with empty calldata is routed through the
NAC gateway's generic `call` entrypoint (Michelson notation `%call`): an
HTTP-style request POSTed to `http://ethereum/<0x>` with the operation's mutez
amount attached.

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant dApp
    participant Relayer
    participant Gateway as NAC Gateway
    participant Wallet as Wallet UI

    dApp->>Relayer: eth_sendTransaction({ to, value })
    Relayer->>Relayer: Build Micheline (call HTTP entrypoint)
    Relayer->>Wallet: Sign Michelson operation
    Wallet->>User: Confirm transaction
    User->>Wallet: Sign
    Wallet->>Gateway: operation → call(http://ethereum/&lt;0x&gt;, …)
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

## Pre-signing validation

Two checks run before any signing popup opens; both reject with JSON-RPC
error `-32602`:

- **`InvalidDestinationError`** — the `to` field must be a canonical `0x` +
  40-hex-character address. The destination is embedded verbatim in the signed
  Micheline (as the `http://ethereum/<to>` URL), so anything else — an ENS
  name, a tz1 address, a string with path segments — is rejected. This check
  runs first, before the transfer / contract-call branching, so it applies to
  bare transfers exactly as it does to [contract calls](./smart-contract-call).
- **`SubMutezPrecisionError`** — the `value` must be divisible by 10¹² wei
  (1 mutez); see below.

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

### Computing the value safely

Compute the wei value as **mutez × 10¹² with `BigInt`** — never as
`parseFloat(amount) * 1e18`. Floating-point multiplication produces sub-mutez
remainders (e.g. `0.1 * 1e18` is not an exact integer in IEEE-754), and any
remainder means an immediate `-32602` rejection:

```ts
const WEI_PER_MUTEZ = 10n ** 12n;

/** '1.5' (tez) → '0x14d1120d7b160000' — exact, max 6 decimals. */
function tezToWeiHex(tez: string): string {
  const [int, frac = ''] = tez.split('.');
  if (frac.length > 6) throw new Error('XTZ has 6 decimals (1 mutez) — trim the input');
  const mutez = BigInt(int + frac.padEnd(6, '0'));
  return '0x' + (mutez * WEI_PER_MUTEZ).toString(16);
}
```

Parsing the decimal string directly (rather than via `parseFloat`) keeps the
whole pipeline in integers, so the resulting value is always mutez-aligned.

## See also

- [Smart contract call flow](./smart-contract-call) — the non-empty-calldata path
- [RelayerProvider](../sdk/provider) — the full `request()` surface · [typed errors](../sdk/cross-runtime#typed-errors)
- [NAC Gateway](../architecture/nac-gateway) — how the `call` entrypoint payload is built
- [Gotchas](/docs/gotchas) — value alignment, fee model, and other integration pitfalls
