---
id: send-xtz
title: Send XTZ
sidebar_label: Send XTZ
---

# Send XTZ

The Send screen lets you transfer XTZ to any Tezos (`tz1 / tz2 / tz3 / KT1`) or EVM (`0x…`) address. The wallet auto-detects the destination runtime and picks the cheapest valid routing path under the hood.

## Steps

1. Click **Send XTZ** on the Home screen
2. **Stage 1 — Form**: enter the destination address and amount
3. **Stage 2 — Review**: confirm destination, amount, and the routing path
4. **Stage 3 — Sent**: view the transaction hash and return home

## Accepted address formats

The destination field accepts any of:

| Format | Example | Routing |
|---|---|---|
| `tz1…` | tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb | Same-runtime · Michelson (native) |
| `tz2…` | tz2TSvNTh2epDMhZHrw73nV9piBX7kLZ9K9m | Same-runtime · Michelson (native) |
| `tz3…` | tz3Nk25mfsfsceBdHXDqHDP6KpUNAbGxksZX | Same-runtime · Michelson (native) |
| `KT1…` | KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw  | Same-runtime · Michelson (native, `default unit`) |
| `0x…`  | 0x1234…abcd                          | Cross-runtime · L1 → L2 via NAC gateway |

The Send page surfaces this in real time via a `RoutingCard` below the recipient input — the pill colour and caption update as you type.

## Amount validation

- Must be a positive decimal number (e.g. `1`, `0.5`, `1.23456`)
- Cannot exceed your current XTZ balance
- Minimum: no enforced minimum (network will reject dust if needed)

## How the transaction is sent

The popup sends a `SEND_TX { to, amount: hexWei, asset }` envelope to the service worker. The service worker branches on `detectRuntime(to)`:

### Same-runtime: native Michelson runtime transfer

For any `tz1 / tz2 / tz3 / KT1` recipient, the wallet emits a **plain Michelson runtime transfer** with no contract call:

```ts
signer.sendNativeTransfer(to, mutezAmount);
// → toolkit.contract.transfer({ to, amount: mutezAmount, mutez: true })
```

No NAC gateway, no synthetic EVM hash, no block scanning. The hash returned to the popup is the **Michelson op hash** (`o…`, Base58Check, ~51 chars), browsable on tzkt.

### Cross-runtime: NAC gateway

For a `0x…` recipient, the kernel needs to materialise the value on the EVM runtime. The wallet falls back to the existing relayer path:

1. `provider.request('eth_sendTransaction', [{ to, value: hexWei, data: '0x' }])`
2. `GatewayBuilder` detects empty calldata → `default` entrypoint
3. `LocalSignerClient.sendContractCall('default', { string: destination }, mutezAmount)` submits a transaction to the NAC gateway (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`)
4. The L1 `opHash` is converted to a synthetic 32-byte EVM-style hash; the relayer then resolves it to the real kernel-synthesized EVM tx hash by scanning blocks

### Amount conversion

The XTZ decimal input is converted to hex wei in the popup, then back to mutez wherever appropriate:

```
wei   = amount × 10^18      (popup → SW)
mutez = wei / 10^12         (SW → Taquito)
```

Both `sendNativeTransfer` and `sendContractCall` consume `mutez`. The cross-runtime path keeps wei inside the `eth_sendTransaction` envelope until the gateway builder converts it.

## Stage 3 — Live status timeline

Since 0.6.0, the "Done" stage shows a **3-step timeline** that polls the right backend until the operation reaches finality:

1. **Broadcasted** — set immediately after the popup hands the op to the SW (active dot, purple, pulsing).
2. **Included** — the op was picked up by a block; the row shows `Block #N`. Polling switches from the fast cadence (2 s) to the slow cadence (5 s).
3. **Finalized** — the op has `≥ FINALIZED_AFTER_BLOCKS` confirmations (currently `2`); the row shows `N confirmation(s)` and the dot turns green.

The timeline reads from:

| Path | Hash format | Status backend | Explorer link |
|---|---|---|---|
| Same-runtime native | `o…` Base58 (~51 chars) | TzKT REST (`/v1/operations/transactions?hash=…` + `/v1/head`) | tzkt |
| Cross-runtime via gateway | `0x…` 32-byte hex | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_blockNumber`) | Blockscout (resolved real EVM hash) |

A `View on tzkt` / `View on blockscout` link sits at the bottom of the timeline regardless of stage, so you can always jump to the explorer.

If the backend can't be reached for `TX_POLL_TIMEOUT_MS` (default 2 minutes — RPC down, network blocked, etc.), the timeline collapses to **Status unavailable** with a manual explorer link. If the op itself reverts or is misapplied, the corresponding step turns red (`failed`) and polling stops.

The poller is built on a generic `lib/poller.ts` engine (`startPoller({ fetch, onUpdate, isDone, intervalMs, timeoutMs, onTimeout })`), separated from the domain-specific L1 / L2 fetchers in `lib/tx-status.ts`. The Send page just calls `trackTx({ hash, runtime, onUpdate })` and stops it on unmount via the returned handle.

:::info Why two paths?
Forwarding a `tz1 → tz1` transfer through the NAC gateway would mean: tz1 → KT1 NAC → mutez forwarded to recipient. Same destination, same amount, but with an extra contract call and a CRAC round-trip the kernel doesn't need. Skipping the gateway saves the fees and the latency.

The cross-runtime case (`tz1 → 0x`) is the only path that genuinely needs the gateway, because the recipient identity lives on the EVM runtime.
:::

:::caution XTZ on a 0x alias is forwarded back to the tz1
Under the Tezos X account model, **EVM aliases cannot hold native XTZ**. The kernel's `AliasForwarder` automatically reroutes any XTZ sent to a `0x` alias back to its tz1 of origin. This means a `tz1 → 0x` XTZ transfer ends up crediting the recipient's `tz1`, not the alias. It's still a useful path when the sender only knows the recipient's EVM address — but the value lands on the Tezos side. ERC-20 tokens (USDC, …) are unaffected ; they live on the alias normally.
:::
