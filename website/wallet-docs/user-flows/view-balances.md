---
id: view-balances
title: View Balances
sidebar_label: View Balances
---

# View Balances

The Home screen shows your native **XTZ** balance and every **registered ERC-20 token** (USDC is seeded by default; custom tokens can be added — see [Custom tokens](./custom-tokens)) on Tezos X Previewnet, with quick access to Send, Receive, and the faucet.

## Displayed assets

| Asset | Source | Unit |
|---|---|---|
| **XTZ** (Tezos account) | Michelson runtime RPC, queried on your `tz1` address | XTZ (mutez → XTZ, 6 decimals) |
| **XTZ** (EVM-native account) | `eth_getBalance` on the Tezlink EVM RPC, queried on your `0x` address | XTZ (wei → XTZ) |
| **Registered ERC-20s** (USDC + custom) | ERC-20 `balanceOf` via `eth_call`, queried on your EVM address (the alias for Tezos accounts) | Token decimals from the registry |

The balance fetch is triggered automatically when the Home screen mounts, and can be refreshed manually with the **↺** button. A **Hide** toggle masks the amounts. An **Add token** affordance at the bottom of the assets list opens the custom-token flow.

## Why XTZ is read from the tz1, not from the EVM alias

On Tezos X, an **EVM alias is not a native EOA** — it's a synthetic identity that the kernel creates on the EVM runtime to represent a `tz1` (or other Tezos account). Crucially, the kernel ships an **`AliasForwarder`**: any XTZ that ends up on a 0x alias is automatically forwarded back to the alias's tz1 of origin.

In other words, **`eth_getBalance(alias)` is structurally always 0** for an alias of one of your Tezos accounts. Your XTZ lives on the `tz1`, period. The wallet therefore queries:

```
GET https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/{tz1}/balance
```

and treats the returned mutez as the canonical XTZ balance. There is no second EVM-runtime XTZ row for a Tezos account — showing one would be misleading because it would always read zero, and the user would think their cross-runtime transfer didn't arrive when in fact the kernel routed it back to the tz1 by design.

EVM-**native** accounts are different: they are not aliases, they hold native XTZ on the EVM runtime directly, and the wallet reads their balance with `eth_getBalance`.

Both fetch helpers (`fetchL1XtzBalance` for the tz1 path, `fetchXtzBalance` for the EVM path) live in `packages/core/src/adapters/tezos/tezos-balance-fetcher.ts`.

## How balances are fetched

### XTZ balance (Michelson runtime)

```ts
// packages/core/src/adapters/tezos/tezos-balance-fetcher.ts
const res = await fetch(
  `${TEZOS_L1_RPC}/chains/main/blocks/head/context/contracts/${tz1}/balance`,
);
const mutezString = await res.json();   // e.g. "1234000000"
```

The mutez decimal is converted to XTZ for display:

```
XTZ = mutez / 10^6
```

The Home dashboard formats the value with 2 to 6 decimal places to keep large balances readable.

### ERC-20 balances (EVM runtime)

For each registered token the wallet calls `balanceOf(address)` via `eth_call`, using the **EVM alias** as the holder for Tezos accounts (or the account's own `0x` address for EVM-native accounts):

```ts
const data =
  '0x70a08231' +                                   // balanceOf(address) selector
  evmAddress.slice(2).padStart(64, '0');           // 32-byte ABI-encoded address

const raw = await tezlink.call(
  { to: tokenAddress, data },
  'latest',
);
// raw is a hex-encoded uint256; scale by the token's decimals for display
```

Unlike XTZ, ERC-20 tokens **do** live on the EVM alias — `AliasForwarder` only intercepts native value transfers, not contract-level token balances.

## Getting Previewnet funds

The **Faucet** button on the Home screen opens the public Tezos X Previewnet faucet:

```
https://faucet.previewnet.tezosx.nomadic-labs.com/
```

(the URL is centralised as `FAUCET_URL` in `packages/core/src/shared/constants.ts`). Anything sent to your `tz1` (or your `0x` for an EVM-native account) is what counts.

## Addresses shown in the header

The account header displays your addresses with copy-to-clipboard buttons:

- For a **Tezos account**: **tz1…** (your Michelson runtime address — the signing key, the XTZ holder) and **0x…** (your EVM alias — the identity dApps see, the holder for ERC-20 tokens).
- For an **EVM-native account**: a single **0x…** address.

Addresses are truncated to `addr(0,6)…addr(-4)` format (e.g. `tz1aBc…xYz1`).

## See also

- [Send XTZ](./send-xtz) — transfer XTZ or tokens to any runtime
- [Custom tokens](./custom-tokens) — register additional ERC-20s
- [Activity tab](./activity-tab) — the history behind these balances
