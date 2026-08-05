---
id: evm-entry
title: EVM Entry Point
sidebar_position: 5
---

# EVM Entry Point — `@tezosx/relayer/evm`

The relayer's main surface (`@tezosx/relayer/tezos`) serves tz1-based
consumers: it wraps EVM intents into Michelson operations. The **`/evm`
entry point** serves the opposite audience — **EVM-native consumers** (an
EVM account, a Solidity contract, or a wallet holding a `0x` key) that want
to reach the **Michelson runtime** through the NAC precompile.

```ts
import {
  buildCrossRuntimeTx,
  buildEvmToTezosCall,
  encodeNacCall,
  encodeNacCallMichelson,
  encodeErc20Transfer,
  trackCrossRuntimeStatus,
  NAC_PRECOMPILE_ADDR,
  NAC_RECOMMENDED_GAS,
} from '@tezosx/relayer/evm';
```

## The NAC precompile

The EVM side of the NAC gateway is a precompile at:

```
0xff00000000000000000000000000000000000007
```

It exposes two payable functions:

| Function | Purpose |
|---|---|
| `call(string url, (string,string)[] headers, bytes body, uint8 method)` | Generic HTTP-style request forwarded to the Michelson runtime. A bare native transfer is a POST (`method = 1`) to `http://tezos/<tz1>` with empty headers and body; `msg.value` is credited to the destination. |
| `callMichelson(string destination, string entrypoint, bytes data)` | ABI call into a Michelson contract. `data` is **raw binary Michelson** (the output of `octez-client convert data … from michelson to binary` — no `0x05` PACK prefix). |

:::caution Zero-bytecode precompile
The precompile has no bytecode, so Solidity 0.8.x's high-level interface
calls fail the compiler-inserted `EXTCODESIZE` check. Call it with a
low-level `.call()` and `abi.encodeWithSelector` instead, and allocate at
least 3M gas to the sub-call (5M for non-trivial `callMichelson` cases).
:::

## `buildCrossRuntimeTx`

Turns a `CrossRuntimeIntent` into a fully-populated EVM transaction, ready to
be signed and broadcast. It encodes the calldata with `buildEvmToTezosCall`
and fetches `nonce` and `chainId` from the EVM RPC through the transport you
provide.

```ts
async function buildCrossRuntimeTx(
  intent:      CrossRuntimeIntent,
  fromAddress: `0x${string}`,
  transport:   TransportPort,
): Promise<EvmCrossRuntimeTx>

interface EvmCrossRuntimeTx {
  to:       `0xff${string}`;  // the NAC precompile
  data:     `0x${string}`;
  value:    bigint;           // wei
  gasLimit: bigint;
  nonce:    bigint;
  chainId:  bigint;
}
```

`TransportPort` is a minimal pair of JSON-RPC channels:

```ts
interface JsonRpcTransport {
  call<T>(method: string, params?: unknown[]): Promise<T>;
}

interface TransportPort {
  evmRpc:     JsonRpcTransport;  // Tezlink EVM endpoint
  tezosL1Rpc: JsonRpcTransport;  // Michelson runtime Octez node
}
```

### Intent kinds

`CrossRuntimeIntent` is a union of three kinds:

| Kind | Fields | Meaning |
|---|---|---|
| `transfer` | `destination` (tz1/KT1), `amount` (**mutez**) | Bare native transfer to a Michelson address, encoded as a generic `call` POST to `http://tezos/<destination>` |
| `call-michelson` | `destination`, `entrypoint`, `binaryMicheline`, `value?` (mutez) | ABI call into a Michelson contract via `callMichelson` |
| `call-evm` | `destination` (0x), `methodSig`, `abiParamsHex`, `value?` | An EVM-target call. **Not accepted by this builder** — an EVM-source call to an EVM contract is a plain EVM transaction, not a cross-runtime one. Passing it throws a `PrecompileError` with code `-32602`. (The Michelson-source equivalent is served by `buildTezosToEvmCall` on the `/tezos` entry.) |

### Value semantics

Intent amounts are denominated in **mutez**. The builder sets the EVM
transaction's `value` to `mutez × 10¹²` wei; the kernel converts it back
wei→mutez on the Michelson side, so the round-trip conserves value exactly
(the historical `call()` inflation bug EL-02 was fixed upstream in
tezos/tezos!21278).

The inverse direction enforces the same **no-silent-floor rule**:
`weiToMutezExact` (exported from `@tezosx/relayer/tezos`) converts wei to
mutez and throws `SubMutezPrecisionError` when the amount is not divisible
by 10¹² wei, instead of silently truncating the remainder.

### Gas budgets

`NAC_RECOMMENDED_GAS` ships the recommended gas limits, applied automatically
by `buildCrossRuntimeTx`:

```ts
const NAC_RECOMMENDED_GAS = {
  call:          3_000_000n,  // generic HTTP call (bare transfers)
  callMichelson: 5_000_000n,  // ABI calls into Michelson
};
```

## Encoders

Lower-level helpers, each returning `0x`-prefixed calldata for an EVM
transaction's `data` field:

```ts
// Generic HTTP call — bare native transfer to a tz1:
encodeNacCall(`http://tezos/${tz1}`, [], '0x', 1 /* POST */);

// ABI call into a Michelson contract:
encodeNacCallMichelson(kt1Address, 'entrypoint_name', binaryMichelineHex);

// ERC-20 transfer(address,uint256) — amount in the token's base units:
encodeErc20Transfer('0xRecipient', 1_000_000n);
```

`encodeErc20Transfer` is also what the wallet uses on the Michelson-source
side: a tz1-source ERC-20 send routes through the NAC gateway with this
calldata and the token contract as `to`, so what's signed is a real ABI
transfer.

## `trackCrossRuntimeStatus`

An async iterable that tracks an **EVM → Michelson** transaction from
broadcast to finality, polling the EVM RPC every 2 s (up to 60 attempts per
phase):

```ts
for await (const status of trackCrossRuntimeStatus(txHash, 'evm-to-michelson', transport)) {
  console.log(status.stage);
}
```

Yielded stages (`CrossTxStatus`):

| Stage | Meaning |
|---|---|
| `broadcasting` | Transaction submitted, waiting for a receipt |
| `included-source` | Receipt found; the EVM transaction is in a block |
| `included-target` | Emitted immediately after `included-source` — the NAC precompile executes synchronously during EVM execution, so source inclusion implies the Michelson-side effect has applied |
| `finalized` | ≥ 2 confirmations on top of the inclusion block |
| `failed` | The EVM transaction reverted, or no receipt appeared within the timeout |
| `unresolved-target` | Included but the finality confirmations did not accumulate within the timeout |

Only the `evm-to-michelson` direction is supported by this entry point;
passing any other direction throws a `RelayerError` with code `-32601`. The
Michelson → EVM direction is already covered by
`RelayerProvider.resolveSyntheticHash` — see
[EIP-1193 → synthetic hash](../architecture/eip1193#transaction-receipts--the-synthetic-hash).

## See also

- [NAC Gateway](../architecture/nac-gateway) — both directions of the gateway, selector resolution
- [API Reference](./api-reference) — the tz1-side provider surface and typed errors
