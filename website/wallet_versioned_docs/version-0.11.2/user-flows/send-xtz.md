---
id: send-xtz
title: Send XTZ
sidebar_label: Send XTZ
---

# Send XTZ

The Send screen lets you transfer XTZ to any Tezos (`tz1 / tz2 / tz3 / KT1`) or EVM (`0x…`) address. The wallet auto-detects the destination runtime, compares it to the active account's runtime, and picks the cheapest valid routing path under the hood.

## Steps

1. Click **Send** on the Home screen
2. **Stage 1 — Form**: enter the destination address and amount
3. **Stage 2 — Review**: confirm destination, amount, and the routing path
4. **Stage 3 — Sent**: view the transaction hash, follow the live timeline, return home

## Routing matrix

Since version 0.7.0 the wallet supports both Michelson and EVM-native accounts. The 4 valid (source kind × destination runtime) combinations are:

| From | To | Route | What gets signed | Hash returned |
|---|---|---|---|---|
| `tz1 / tz2 / tz3 / KT1` | `tz1 / tz2 / tz3 / KT1` | Same-runtime · Tezos L1 | Native Michelson transfer (Taquito) | L1 op hash (`o…`, Base58) |
| `tz1 / tz2 / tz3 / KT1` | `0x…` | Cross-runtime · L1 → L2 via NAC gateway | Michelson op against `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` | Synthetic EVM hash, resolved to the real one within ~60s |
| `0x…` | `0x…` | Same-runtime · Tezos L2 (EVM) | EIP-1559 type-`0x02` tx | Real EVM tx hash |
| `0x…` | `tz1 / tz2 / tz3 / KT1` | Cross-runtime · L2 → L1 via NAC precompile | EIP-1559 tx calling `0xff00000000000000000000000000000000000007` | Real EVM tx hash |

The Send page surfaces the active route in real time via a `RoutingCard` below the recipient input — the pill colour and caption update as you type. From an EVM account the USDC asset selector is disabled (`Soon · EVM-source` tooltip).

## Amount validation

- Must be a positive decimal number (e.g. `1`, `0.5`, `1.23456`)
- Cannot exceed your current native XTZ balance (read from L1 RPC for Michelson accounts, `eth_getBalance` for EVM-native accounts)
- Minimum: no enforced minimum (network will reject dust if needed)
- EVM-source sends reserve gas implicitly: with the default 2 M gas limit and `maxFeePerGas = 2 × eth_gasPrice ≈ 2 gwei`, that's roughly 0.004 XTZ in fee headroom per send.

## How the transaction is sent

The popup sends a `SEND_TX { to, amount: hexWei, asset }` envelope to the service worker. `decideRoute(activeAccount, to)` resolves the route, then `sendTransfer` dispatches across the matrix.

### tz1 → tz1: native Michelson runtime transfer

The wallet emits a plain Michelson transfer with no contract call:

```ts
signer.sendNativeTransfer(to, mutezAmount);
// → toolkit.contract.transfer({ to, amount: mutezAmount, mutez: true })
```

No NAC gateway, no synthetic EVM hash, no block scanning. The hash returned to the popup is the **Michelson op hash** (`o…`, Base58Check, ~51 chars), browsable on tzkt.

### tz1 → 0x: NAC gateway (cross-runtime)

The kernel materialises the value on the EVM runtime via the gateway contract:

1. `provider.request('eth_sendTransaction', [{ to, value: hexWei, data: '0x' }])` on the `RelayerProvider` (Tezos container)
2. `buildTezosToEvmCall` detects empty calldata → `default` entrypoint
3. `TezosSigner.sendContractCall('default', { string: destination }, mutezAmount)` submits the operation to `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`
4. The L1 `opHash` is converted to a synthetic 32-byte EVM hash; the relayer then resolves it to the real kernel-synthesized EVM tx hash by scanning blocks

### 0x → 0x: native EVM transfer (same-runtime L2)

The wallet's `EvmProvider` adapter takes over:

1. Read `eth_chainId`, `eth_getTransactionCount`, `eth_gasPrice` in parallel
2. `signTransaction1559({ to, value, data: '0x', maxFeePerGas: 2 × gasPrice, maxPriorityFeePerGas: 0 })` produces the raw EIP-1559 tx
3. Broadcast via `eth_sendRawTransaction` on the Tezlink EVM RPC

The returned hash is already the real EVM tx hash; no resolution step is needed.

### 0x → tz1: NAC precompile (cross-runtime)

For an EVM-native account sending to a Tezos address, the wallet builds a transaction to the **NAC precompile** at `0xff00000000000000000000000000000000000007`:

1. `buildCrossRuntimeTx` from `@tezosx/relayer/evm` encodes a call to `transfer(string)` with the destination tz1 as the argument
2. `EvmSigner.signEvmTx` signs the resulting EIP-1559 tx with the user's secp256k1 key, using `2 × eth_gasPrice` for `maxFeePerGas`
3. Broadcast via `eth_sendRawTransaction`; the kernel atomically forwards the value to the receiving tz1

The hash is the real EVM tx hash. The receiving tz1 sees the credit on tzkt; the EVM tx itself is visible on Blockscout calling the precompile.

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
3. **Finalized** — for **L1 native** ops, the row reads "attested" (or "N attestations") and the dot turns green once `head.level - op.level ≥ TEZOS_L1_FINALITY_BLOCKS` (currently `2`, the Tenderbake attestation depth). For **L2** ops (cross-runtime and native L2 alike), the row reads "final on L1" once the tx's L2 block has been included in a finalised L1 Tezos block — the wallet polls `eth_getBlockByNumber("finalized", false)` on the Tezlink EVM RPC and considers the tx finalised when its block number is ≤ the `finalized` block.

:::info L2 finality is L1-anchored on Tezos X
A Tezlink L2 block on Tezos X is final when its parent L1 block is final — not after a fixed count of L2 blocks above it. The `finalized` block tag exposed by the Tezlink EVM RPC tracks that signal directly: it returns the most recent L2 block whose L1 parent has reached Tenderbake finality. Polling it and checking `tx.blockLevel ≤ finalized.number` is the correct (and tight) finality test.

Earlier versions of the wallet used heuristics — first a `head - tx ≥ 2` L2-block count (ported from Ethereum mainnet), then a same-block "treat inclusion as final" shortcut. Both were misaligned: the first overcounts (extra L2 blocks add no guarantee), the second undercounts (L1 finality hasn't actually happened yet at receipt time). 0.10.1 switches to the `finalized` tag, per kernel-team feedback (`#techrel-tezosx-mvp`, 2026-05-15).

L1 ops keep their Tenderbake check: a Tezos L1 block is final after 2 attestation rounds, and `head.level - op.level ≥ 2` is the canonical condition. The constant lives in `shared/constants.ts` as `TEZOS_L1_FINALITY_BLOCKS` (renamed from `FINALIZED_AFTER_BLOCKS` in 0.10.1 to pin its scope to L1).
:::

The timeline reads from:

| Path | Hash format | Status backend | Explorer link |
|---|---|---|---|
| `tz1 → tz1` same-runtime | `o…` Base58 (~51 chars) | TzKT REST (`/v1/operations/transactions?hash=…` + `/v1/head`) | tzkt |
| `tz1 → 0x` via NAC gateway | `0x…` 32-byte hex (synthetic, resolved) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout (resolved real EVM hash) |
| `0x → 0x` same-runtime L2 | `0x…` 32-byte hex (real) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout |
| `0x → tz1` via NAC precompile | `0x…` 32-byte hex (real) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout (precompile call); tzkt shows the receiving tz1 credit |

A `View on tzkt` / `View on blockscout` link sits at the bottom of the timeline regardless of stage, so you can always jump to the explorer.

If the backend can't be reached for `TX_POLL_TIMEOUT_MS` (default 2 minutes — RPC down, network blocked, etc.), the timeline collapses to **Status unavailable** with a manual explorer link. If the op itself reverts or is misapplied, the corresponding step turns red (`failed`) and polling stops.

The poller is built on a generic `shared/poller.ts` engine (`startPoller({ fetch, onUpdate, isDone, intervalMs, timeoutMs, onTimeout })`), separated from the domain-specific L1 / L2 fetchers in `shared/tx-status.ts`. The Send page just calls `trackTx({ hash, runtime, onUpdate })` and stops it on unmount via the returned handle.

:::info Why four paths?
The kernel can settle a transfer on either runtime. Same-runtime transfers (`tz1 → tz1`, `0x → 0x`) skip the NAC indirection entirely — they pay only the native fees of their runtime. Cross-runtime transfers need the kernel's atomic forwarding primitive, which lives in two distinct contracts depending on which side initiates: the `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` gateway on Michelson (used by `tz1 → 0x`), and the `0xff…007` precompile on EVM (used by `0x → tz1`). The wallet's `decideRoute` resolves the four cases by comparing the active account's kind with the destination address format.
:::

:::caution XTZ on a tz1's EVM alias is forwarded back to its origin tz1
Under the Tezos X account model, **EVM aliases of Tezos accounts cannot hold native XTZ**. The kernel's `AliasForwarder` automatically reroutes any XTZ sent to such an alias back to its tz1 of origin. This means a `tz1 → 0x` XTZ transfer where the destination 0x is the alias of a known tz1 ends up crediting that tz1, not the alias.

EVM-native accounts (those created with a standalone secp256k1 key, no underlying tz1) are **not aliases** — they can hold native XTZ on L2 normally, and `0x → 0x` transfers between them settle as ordinary L2 sends. ERC-20 tokens (USDC, …) are unaffected by the alias forwarder regardless ; they live in contract mappings.
:::
