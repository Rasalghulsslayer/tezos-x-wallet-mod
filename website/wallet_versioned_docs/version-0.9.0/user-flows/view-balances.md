---
id: view-balances
title: View Balances
sidebar_label: View Balances
---

# View Balances

The Home screen shows your **XTZ** and **USDC** balances on Tezos X Previewnet, with quick access to Send and the faucet.

## Displayed assets

| Asset | Source | Unit |
|---|---|---|
| **XTZ**  | Michelson runtime RPC, queried on your `tz1` address | XTZ (mutez → XTZ, 6 decimals) |
| **USDC** | ERC-20 `balanceOf` on the EVM-side USDC contract, queried on your EVM alias | USDC (6 decimals) |

The balance fetch is triggered automatically when the Home screen mounts, and can be refreshed manually with the **↺** button.

## Why XTZ is read from the tz1, not from the EVM alias

On Tezos X, an **EVM alias is not a native EOA** — it's a synthetic identity that the kernel creates on the EVM runtime to represent a `tz1` (or other Tezos account). Crucially, the kernel ships an **`AliasForwarder`** : any XTZ that ends up on a 0x alias is automatically forwarded back to the alias's tz1 of origin.

In other words, **`eth_getBalance(alias)` is structurally always 0** for an alias of one of your accounts. Your XTZ lives on the `tz1`, period. The wallet therefore queries:

```
GET https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/{tz1}/balance
```

and treats the returned mutez as the canonical XTZ balance. There is no second L2 row — showing one would be misleading because it would always read zero, and the user would think their cross-runtime transfer didn't arrive when in fact the kernel routed it back to the tz1 by design.

`fetchXtzBalance(evmAddr)` is still exported by `lib/balances.ts` for diagnostic purposes (and for a future Activity page if needed), but is not consumed by Home.

## How balances are fetched

### XTZ balance (Michelson runtime)

```ts
// packages/wallet/src/lib/balances.ts
const res = await fetch(
  `${TEZOS_L1_RPC}/chains/main/blocks/head/context/contracts/${tz1}/balance`,
);
const mutezString = await res.json();   // e.g. "1234000000"
```

The mutez decimal is converted to XTZ for display:

```
XTZ = mutez / 10^6
```

The Home dashboard caps the displayed value at 2 decimal places to keep large balances readable.

### USDC balance (EVM runtime)

The wallet calls `balanceOf(address)` on the USDC contract via `eth_call`, using the **EVM alias** as the holder:

```ts
const data =
  '0x70a08231' +                                   // balanceOf(address) selector
  evmAlias.slice(2).padStart(64, '0');             // 32-byte ABI-encoded address

const raw = await tezlink.call(
  { to: USDC_CONTRACT, data },
  'latest',
);
// raw is a hex-encoded uint256 ; divide by 10^6 for USDC display
```

Unlike XTZ, ERC-20 USDC **does** live on the EVM alias — `AliasForwarder` only intercepts native value transfers, not contract-level token balances.

## Getting Previewnet funds

The wallet links to an external **USDC faucet** for Tezos X Previewnet via the **Faucet** button on the Home screen.

For XTZ, request funds in the Tezos X developer channels or via the Nomadic Labs internal Previewnet faucet — anything sent to your `tz1` is what counts.

## Addresses shown in the header

The Header displays both your addresses with copy-to-clipboard buttons:

- **tz1…** — your Michelson runtime address. The signing key. The XTZ holder.
- **0x…** — your EVM alias. The identity dApps see, the holder for ERC-20 tokens.

Both are truncated to `addr(0,6)…addr(-4)` format (e.g. `tz1aBc…xYz1`).
