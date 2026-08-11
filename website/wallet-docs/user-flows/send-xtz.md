---
id: send-xtz
title: Send XTZ
sidebar_label: Send XTZ
---

# Send XTZ

The Send screen lets you transfer XTZ — or a registered ERC-20 token — to any Tezos (`tz1 / tz2 / tz3 / KT1`) or EVM (`0x…`) address. The wallet auto-detects the destination runtime, compares it to the active account's runtime, and picks the cheapest valid routing path under the hood.

## Steps

1. Click **Send** on the Home screen
2. **Stage 1 — Form**: pick the asset, enter the destination address and amount
3. **Stage 2 — Review**: confirm destination, amount, and the routing path
4. **Stage 3 — Sent**: view the transaction hash, follow the live timeline, return home

## Routing matrix

The wallet supports both Michelson and EVM-native accounts. The 4 valid (source kind × destination runtime) combinations, with the exact captions the Review lane shows:

| From | To | Route | What gets signed | Hash returned |
|---|---|---|---|---|
| `tz1 / tz2 / tz3 / KT1` | `tz1 / tz2 / tz3 / KT1` | Same-runtime · Michelson runtime | Native Michelson transfer (Taquito) | Michelson op hash (`o…`, Base58) |
| `tz1 / tz2 / tz3 / KT1` | `0x…` | Cross-runtime · Michelson → EVM via NAC gateway | Michelson op against `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` | Synthetic EVM hash, resolved to the real one (typically ~30 s) |
| `0x…` | `0x…` | Same-runtime · Tezos X (EVM) | EIP-1559 type-`0x02` tx | Real EVM tx hash |
| `0x…` | `tz1 / tz2 / tz3 / KT1` | Cross-runtime · EVM → Michelson via NAC precompile | EIP-1559 tx calling `0xff00000000000000000000000000000000000007` | Real EVM tx hash |

The Send page surfaces the active route in real time via a `RoutingCard` below the recipient input — the pill colour and caption update as you type. The asset selector lists XTZ plus every registered token; from an EVM account, ERC-20 assets are disabled (`Soon · EVM-source` tooltip) — token sends from EVM-native accounts land in a follow-up release.

## Recipient validation

- The destination must parse as a Tezos address (`tz1/tz2/tz3/KT1`) or a 40-hex-digit `0x` address.
- **EIP-55 checksums are enforced**: a mixed-case `0x` address whose casing doesn't match its keccak checksum is treated as a typo and refused (all-lowercase and all-uppercase addresses carry no checksum and are accepted).
- **Self-sends are refused**: sending to the active account's own address only burns fees, so the service worker rejects it. A `tz1` sending to its *own EVM alias* is allowed — that's alias forwarding, a real operation (see the caution below).
- An ERC-20 asset cannot target a Michelson-runtime destination — tokens only exist on the EVM runtime (the `RoutingCard` flips to a warning).

## Contacts in the Send flow

Saved [contacts](./contacts) surface at three points:

- **Suggestions while typing** — focusing the recipient field offers up to five contacts matching your input by name or address prefix (the whole book, capped, when the field is empty); picking one fills the address.
- **Resolved name** — when the typed address is a saved contact, its name is shown under the field and again in the Review stage's **To** lane, so you confirm a name, not just a hex string.
- **Post-send save offer** — after a successful send to a valid address the book doesn't know yet, the Done stage offers to **Save as contact** without leaving the flow.

## Amount validation

- Must be a positive decimal number (e.g. `1`, `0.5`, `1.23456`)
- Cannot exceed your current balance for the selected asset (XTZ read from the Michelson RPC for Tezos accounts, `eth_getBalance` for EVM-native accounts; ERC-20s via `balanceOf`)
- **Sub-mutez precision is rejected, not floored**: any XTZ amount that converts to a non-integer number of mutez (wei not divisible by 10¹²) is refused by `weiToMutezExact` rather than silently rounded away
- The **Max** button on XTZ keeps a 10 000-mutez (0.01 XTZ) reserve for fees
- EVM-source sends price fees at `maxFeePerGas = 2 × eth_gasPrice`

## How the transaction is sent

The popup sends a `SEND_TX { to, amount, asset }` envelope to the service worker (`amount` is hex base units — wei for XTZ, token decimals for an ERC-20). `decideRoute(activeAccount, to)` resolves the route, then the `sendTransfer` use case (`packages/core/src/use-cases/send-transfer.ts`) dispatches across the matrix.

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
2. `buildTezosToEvmCall` detects empty calldata → the generic `call` entrypoint (a `%call` HTTP request: a POST to `http://ethereum/<destination>` with empty headers and an empty body). The legacy `%default` helper was removed in the Tezos X release candidate.
3. The signer submits the operation to `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` with the mutez amount attached
4. The Michelson op hash is converted to a synthetic 32-byte EVM hash; the relayer then resolves it to the real kernel-synthesized EVM tx hash by scanning blocks — typically within **~30 s** (the relayer retries 15 times at 2 s intervals)

**Sending an ERC-20 from a Tezos account** takes the same gateway but the `call_evm` entrypoint: the wallet encodes a real `transfer(recipient, amount)` ABI call against the *token contract* (value 0, amount in the token's base units) and signs that. The Review screen's "What you actually sign" card shows the Michelson target, the entrypoint (`call` for XTZ, `call_evm` for a token), the decoded method (`transfer(address,uint256)`), and the exact mutez debit.

### 0x → 0x: native EVM transfer (same-runtime)

The wallet's `EvmProvider` adapter takes over:

1. Read `eth_chainId`, `eth_getTransactionCount`, `eth_gasPrice` in parallel
2. `signTransaction1559({ to, value, data: '0x', maxFeePerGas: 2 × gasPrice, maxPriorityFeePerGas: 0 })` produces the raw EIP-1559 tx
3. Broadcast via `eth_sendRawTransaction` on the Tezlink EVM RPC

The returned hash is already the real EVM tx hash; no resolution step is needed.

### 0x → tz1: NAC precompile (cross-runtime)

For an EVM-native account sending to a Tezos address, the wallet builds a transaction to the **NAC precompile** at `0xff00000000000000000000000000000000000007`:

1. `buildCrossRuntimeTx` from `@tezosx/relayer/evm` encodes a generic `call(string,(string,string)[],bytes,uint8)` — a POST to `http://tezos/<tz1>` with an empty body — to the precompile (the legacy `transfer(string)` selector was removed in the Tezos X release candidate)
2. `EvmSigner.signEvmTx` signs the resulting EIP-1559 tx with the user's secp256k1 key, using `2 × eth_gasPrice` for `maxFeePerGas`
3. Broadcast via `eth_sendRawTransaction`; the kernel atomically forwards the value to the receiving tz1

The hash is the real EVM tx hash. The receiving tz1 sees the credit on tzkt; the EVM tx itself is visible on Blockscout calling the precompile.

### Amount conversion

The XTZ decimal input is converted to hex wei in the popup, then back to mutez wherever appropriate:

```
wei   = amount × 10^18      (popup → SW)
mutez = wei / 10^12         (SW → Taquito; exact division enforced)
```

The cross-runtime path keeps wei inside the `eth_sendTransaction` envelope until the gateway builder converts it. ERC-20 amounts are scaled by the token's own decimals instead, so the signed `transfer` amount matches what the user typed.

## Stage 3 — Live status timeline

The "Done" stage shows a **3-step timeline** that polls the right backend until the operation reaches finality:

1. **Broadcasted** — set immediately after the popup hands the op to the SW (active dot, purple, pulsing).
2. **Included** — the op was picked up by a block; the row shows `Block #N`. Polling switches from the fast cadence (2 s) to the slow cadence (5 s).
3. **Finalized** — for **Michelson-runtime native** ops, the row reads "attested" (or "N attestations") and the dot turns green once `head.level - op.level ≥ TEZOS_L1_FINALITY_BLOCKS` (currently `2`, the Tenderbake attestation depth). For **EVM-runtime** txs (cross-runtime and same-runtime alike), the row reads "final" once the tx's block has been anchored in a finalized Tezos L1 block — the wallet polls `eth_getBlockByNumber("finalized", false)` on the Tezlink EVM RPC and considers the tx finalised when its block number is ≤ the `finalized` block.

:::info EVM-runtime finality is anchored on Tezos L1
An EVM-runtime block on Tezos X is final when the Tezos L1 block that anchors it is final — not after a fixed count of EVM blocks above it. The `finalized` block tag exposed by the Tezlink EVM RPC tracks that signal directly: it returns the most recent EVM block whose Tezos L1 anchor has reached Tenderbake finality. Polling it and checking `tx.blockLevel ≤ finalized.number` is the correct (and tight) finality test.

Earlier versions of the wallet used heuristics — first a `head - tx ≥ 2` block count (ported from Ethereum mainnet), then a same-block "treat inclusion as final" shortcut. Both were misaligned: the first overcounts (extra EVM blocks add no guarantee), the second undercounts (Tezos L1 finality hasn't actually happened yet at receipt time). The wallet now uses the `finalized` tag.

Michelson-runtime ops keep their Tenderbake check: a Tezos L1 block is final after 2 attestation rounds, and `head.level - op.level ≥ 2` is the canonical condition. The constant lives in `packages/core/src/shared/constants.ts` as `TEZOS_L1_FINALITY_BLOCKS`.
:::

The timeline reads from:

| Path | Hash format | Status backend | Explorer link |
|---|---|---|---|
| `tz1 → tz1` same-runtime | `o…` Base58 (~51 chars) | TzKT REST (`/v1/operations/transactions?hash=…` + `/v1/head`) | tzkt |
| `tz1 → 0x` via NAC gateway | `0x…` 32-byte hex (synthetic, resolved) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout (resolved real EVM hash) |
| `0x → 0x` same-runtime | `0x…` 32-byte hex (real) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout |
| `0x → tz1` via NAC precompile | `0x…` 32-byte hex (real) | Tezlink EVM JSON-RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber("finalized")`) | Blockscout (precompile call); tzkt shows the receiving tz1 credit |

A `View on tzkt` / `View on blockscout` link sits at the bottom of the timeline regardless of stage, so you can always jump to the explorer.

If the backend can't be reached for `TX_POLL_TIMEOUT_MS` (default 2 minutes — RPC down, network blocked, etc.), the timeline collapses to **Status unavailable** with a manual explorer link. If the op itself reverts or is misapplied, the corresponding step turns red (`failed`) and polling stops.

The poller is built on a generic `poller.ts` engine (`startPoller({ fetch, onUpdate, isDone, intervalMs, timeoutMs, onTimeout })`), separated from the domain-specific status fetchers in `packages/core/src/shared/tx-status.ts`. The Send page just calls `trackTx({ hash, runtime, onUpdate })` and stops it on unmount via the returned handle.

:::info Why four paths?
The kernel can settle a transfer on either runtime. Same-runtime transfers (`tz1 → tz1`, `0x → 0x`) skip the NAC indirection entirely — they pay only the native fees of their runtime. Cross-runtime transfers need the kernel's atomic forwarding primitive, which lives in two distinct contracts depending on which side initiates: the `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` gateway on Michelson (used by `tz1 → 0x`), and the `0xff…007` precompile on EVM (used by `0x → tz1`). The wallet's `decideRoute` resolves the four cases by comparing the active account's kind with the destination address format.
:::

:::caution XTZ on a tz1's EVM alias is forwarded back to its origin tz1
Under the Tezos X account model, **EVM aliases of Tezos accounts cannot hold native XTZ**. The kernel's `AliasForwarder` automatically reroutes any XTZ sent to such an alias back to its tz1 of origin. This means a `tz1 → 0x` XTZ transfer where the destination 0x is the alias of a known tz1 ends up crediting that tz1, not the alias.

EVM-native accounts (those created with a standalone secp256k1 key, no underlying tz1) are **not aliases** — they can hold native XTZ on the EVM runtime normally, and `0x → 0x` transfers between them settle as ordinary same-runtime sends. ERC-20 tokens (USDC, …) are unaffected by the alias forwarder regardless; they live in contract mappings.
:::

## See also

- [Activity tab](./activity-tab) — where sent transfers land, including cross-runtime rows
- [View Balances](./view-balances) — where the available amounts come from
- [Custom tokens](./custom-tokens) — registering the ERC-20s the asset selector offers
- [Contacts](./contacts) — managing the address book behind the recipient suggestions
