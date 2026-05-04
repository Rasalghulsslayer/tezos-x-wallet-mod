---
id: view-balances
title: View Balances
sidebar_label: View Balances
---

# View Balances

The Home screen shows your XTZ and USDC balances on the Tezos X Previewnet and provides quick access to Send and the faucet.

## Displayed assets

| Asset | Source | Unit |
|---|---|---|
| **XTZ** | `eth_getBalance` on your EVM alias | XTZ (18 decimal conversion from wei) |
| **USDC** | ERC-20 `balanceOf` on the testnet USDC contract | USDC (6 decimals) |

The balance fetch is triggered automatically when the Home screen mounts, and can be refreshed manually with the **↺** button.

## How balances are fetched

### XTZ balance

```ts
// packages/wallet/src/lib/balances.ts
const raw = await provider.request({
  method: 'eth_getBalance',
  params: [evmAlias, 'latest'],
});
// raw is a hex string, e.g. "0x2386f26fc10000"
```

The raw hex wei value is converted to XTZ for display:

```
XTZ = wei / 10^18
```

Note: Tezos uses 10^6 mutez per tez, but the Etherlink EVM layer represents values in wei (10^18). The conversion divides by 10^18 to get XTZ.

### USDC balance

The wallet calls `balanceOf(address)` on the testnet USDC contract via `eth_call`:

```ts
const USDC_CONTRACT = '0xb155450fbbe8b5bf1f584374243c7bde5609ab1f';

const data =
  '0x70a08231' +                                   // balanceOf selector
  evmAlias.slice(2).padStart(64, '0');             // address as 32-byte param

const raw = await provider.request({
  method: 'eth_call',
  params: [{ to: USDC_CONTRACT, data }, 'latest'],
});
// raw is hex-encoded uint256; divide by 10^6 for USDC display value
```

## Getting testnet funds

The wallet links to an external **USDC faucet** for the Tezos X Previewnet. Click the **Faucet** button on the Home screen to open it in a new tab.

For XTZ, ask in the Tezos X developer channels or use the Nomadic Labs internal testnet faucet.

## Addresses shown in the header

The Header component displays both your addresses with copy-to-clipboard buttons:

- **tz1…** (top row) — your Tezos L1 address, used for signing
- **0x…** (bottom row) — your EVM alias, shown to dApps

Both are truncated to `addr(0,6)…addr(-4)` format (e.g. `tz1aBc…xYz1`).
