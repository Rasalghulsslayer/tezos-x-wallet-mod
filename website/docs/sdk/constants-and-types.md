---
id: constants-and-types
title: Constants & types
---

# Constants & types

## Constants — `@tezosx/relayer/constants` {#constants--tezosxrelayerconstants}

The kernel-level facts, exported so nothing gets hardcoded downstream:

| Constant | Value | What it is |
|---|---|---|
| `TEZLINK_EVM_RPC` | `https://evm.previewnet.tezosx.nomadic-labs.com` | The EVM runtime JSON-RPC node |
| `TEZOS_L1_RPC` | `https://michelson.previewnet.tezosx.nomadic-labs.com` | The Michelson runtime node (signing / injection) |
| `NAC_CONTRACT` | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` | The NAC gateway contract (Michelson side) |
| `NAC_ENTRYPOINT` | `call_evm` | The gateway's ABI-call entrypoint name |
| `NAC_PRECOMPILE_ADDR` | `0xff00000000000000000000000000000000000007` | The NAC precompile (EVM side) |
| `NAC_RECOMMENDED_GAS` | `{ call: 3_000_000n, callMichelson: 5_000_000n }` | Gas budgets for precompile sub-calls |
| `NAC_HTTP_POST` | `1` | The HTTP-method enum value for the generic `call` |
| `NAC_TEZOS_RUNTIME_URL` | `http://tezos/` | URL prefix crediting a tz1/KT1 (EVM → Michelson) |
| `NAC_ETHEREUM_RUNTIME_URL` | `http://ethereum/` | URL prefix crediting a 0x (Michelson → EVM) |
| `RPC_TIMEOUT_MS` | `15_000` | The read deadline ([behavior](./provider#timeouts-and-transport-errors)) |

**There is no chain-id constant here.** The chain id (`128064` / `0x1f440`)
is fetched at runtime via `eth_chainId`; as a product-level constant it lives
in `@tezosx/wallet-core`, alongside the explorer URLs, the TzKT API base and
the USDC address.

## Types — `@tezosx/relayer/types` {#types--tezosxrelayertypes}

The shared vocabulary, grouped by what you're doing:

**Talking EIP-1193** — `EIP1193Provider` (EventEmitter-based, `request()` +
`on()` overloads), `RequestArguments`, `ProviderRpcError`
(`{ code: number; data?: unknown }` on `Error`), `ProviderConnectInfo`.

**Building cross-runtime calls** — `CrossRuntimeIntent` (the three-kind
union), `GatewayCall` / `PrecompileCall` / `CrossRuntimeCall`,
`CrossRuntimeDirection` (`'michelson-to-evm' | 'evm-to-michelson'`),
`EthTransactionRequest`, `EthTransactionReceipt`.

**Tracking** — `CrossTxStatus` (the six-stage union yielded by
[`trackCrossRuntimeStatus`](./cross-runtime#trackcrossruntimestatus--follow-it-to-finality)),
`PendingOpView` (an unresolved op: `l1OpHash`, `evmAlias`, `to`, `fromBlock`,
`broadcastedAt`), `PendingOp`.

**Implementing a wallet client** — `ITezosWalletClient`,
`WalletPermissions`, `JsonRpcTransport` / `TransportPort`.

Two caveats worth knowing:

- **`PendingOpsStore` / `PendingOpsSnapshot` are NOT in `/types`** — import
  them from `@tezosx/relayer/tezos`. `PendingOp` itself is best treated as an
  opaque persistence payload, not a consumer type.
- The `NacHttpHeader` shape (`{ key, value }`) taken by `encodeNacCall`'s
  `headers` parameter is not currently re-exported — pass `[]` or shape the
  objects inline.

## Error classes

Two separate hierarchies:

- **`RelayerError`** (base, carries `code` + optional `data`) with subclasses
  **`GatewayError`** and **`PrecompileError`** — exported from `/types`. In
  practice only `PrecompileError` is thrown today (by the EVM-side builder on
  a `call-evm` intent, and by the tracker on a wrong direction).
- **The three build errors** — `UnknownSelectorError`,
  `SubMutezPrecisionError`, `InvalidDestinationError` — extend plain `Error`
  (not `RelayerError`) and are exported from `@tezosx/relayer/tezos`. Catch
  them by `instanceof`; the provider translates all three to JSON-RPC
  `-32602` ([details](./cross-runtime#typed-errors)).
