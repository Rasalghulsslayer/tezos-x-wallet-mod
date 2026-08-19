---
id: cross-runtime
title: Cross-runtime builders
---

# Cross-runtime builders

Both directions across the runtime boundary, plus the helpers that surround
them: value conversion, alias mapping, hash derivation, and a typed EVM RPC
client.

## Michelson → EVM — `buildTezosToEvmCall`

What `eth_sendTransaction` uses internally, exported for direct use:

```ts
import { buildTezosToEvmCall } from '@tezosx/relayer/tezos';
// Metro-safe deep path: '@tezosx/relayer/use-cases/build-tezos-to-evm-call'

const gatewayCall = await buildTezosToEvmCall({
  to:    '0x1a2B3c4D5e6F70819293A4B5c6D7E8F901234567',
  value: '0xde0b6b3a7640000',   // 1 XTZ — must be a whole number of mutez
  data:  '0xa9059cbb…',         // optional; empty ⇒ bare native transfer
});
// → { direction: 'michelson-to-evm', contractAddr: 'KT18oDJJ…', entrypoint: 'call' | 'call_evm',
//     michelineArg, mutezAmount: bigint, methodSig?: string }
```

Entrypoint selection: empty calldata → the gateway's generic `call`
(a POST to `http://ethereum/<to>` with the mutez attached); non-empty
calldata → `call_evm` with the full text method signature resolved from a
curated 17-entry allow-list ([why an allow-list](../architecture/nac-gateway#selector-resolution)).
Use it directly when you build Michelson operations yourself instead of going
through the provider — the returned `michelineArg`/`mutezAmount` feed
`sendContractCall`.

### Typed errors {#typed-errors}

All three are thrown **before anything is signed**, and translated to
JSON-RPC `-32602` by the provider. Catch them by `instanceof` (exported from
`@tezosx/relayer/tezos`):

| Error | Trigger | Payload |
|---|---|---|
| `UnknownSelectorError` | calldata selector not in the allow-list | `selectorHex` |
| `SubMutezPrecisionError` | `value` not divisible by 10¹² wei (1 mutez) — the remainder would be silently lost | `weiValue`, `remainderWei` |
| `InvalidDestinationError` | `to` is not a canonical `0x` + 40-hex address — the destination is embedded verbatim in the signed payload | `to` |

### `weiToMutezExact`

```ts
import { weiToMutezExact } from '@tezosx/relayer/tezos';
weiToMutezExact(10n ** 18n);  // → 1_000_000n mutez
weiToMutezExact(500n);        // → throws SubMutezPrecisionError
```

The no-silent-floor conversion rule, exported so your own transfer paths can
enforce the same guarantee before submitting.

## EVM → Michelson — `@tezosx/relayer/evm`

For EVM-native consumers (a 0x key, or a Solidity contract) reaching the
Michelson runtime through the **NAC precompile** at
`0xff00000000000000000000000000000000000007`.

```ts
import {
  buildCrossRuntimeTx,
  trackCrossRuntimeStatus,
  NAC_RECOMMENDED_GAS,
} from '@tezosx/relayer/evm';
```

### `buildCrossRuntimeTx` — intent in, signable transaction out

```ts
const tx = await buildCrossRuntimeTx(
  { kind: 'transfer', destination: 'tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx', amount: 1_000_000n /* mutez */ },
  myEvmAddress,
  transport,   // { evmRpc, tezosL1Rpc } — see below
);
// → { to: '0xff…07', data, value: bigint, gasLimit: bigint, nonce: bigint, chainId: bigint }
// Sign it with your own key and broadcast via eth_sendRawTransaction.
```

Intent kinds (`CrossRuntimeIntent`):

| Kind | Fields | Meaning |
|---|---|---|
| `transfer` | `destination` (tz1/KT1), `amount` (**mutez**) | Bare native transfer — a generic `call` POST to `http://tezos/<destination>` |
| `call-michelson` | `destination`, `entrypoint`, `binaryMicheline`, `value?` | ABI call into a Michelson contract via `callMichelson`. `binaryMicheline` is **raw binary Michelson** (`octez-client convert data … from michelson to binary` — no `0x05` PACK prefix) |
| `call-evm` | — | **Rejected** (`PrecompileError`, `-32602`): an EVM-source call to an EVM contract is a plain EVM transaction, not cross-runtime |

Two cautions:

- **The builder does not validate `destination`** — it is interpolated
  verbatim into the URL. Validate the tz1/KT1 shape caller-side (the tz1-side
  builder has `InvalidDestinationError`; this one deliberately trusts you).
- **`TransportPort.tezosL1Rpc` is reserved** — nothing in the current SDK
  calls it; both builders use `evmRpc` only. A stub satisfies the type.

Value semantics: intent amounts are **mutez**; the builder sets
`value = mutez × 10¹²` wei and the kernel converts back exactly — the
round-trip conserves value (the historical `call()` inflation bug EL-02 was
fixed upstream in tezos/tezos!21278).

Gas: applied automatically from `NAC_RECOMMENDED_GAS` — 3 000 000 for the
generic `call`, 5 000 000 for `callMichelson`. From Solidity, call the
precompile with a low-level `.call()` (it has no bytecode, so high-level
interface calls fail the `EXTCODESIZE` check) and allocate the same budgets
to the sub-call.

### Encoders (lower-level)

```ts
import { encodeNacCall, encodeNacCallMichelson, encodeErc20Transfer } from '@tezosx/relayer/evm';

encodeNacCall(`http://tezos/${tz1}`, [], '0x', 1 /* POST */); // bare transfer calldata
encodeNacCallMichelson(kt1, 'entrypoint_name', binaryMichelineHex);
encodeErc20Transfer('0x1a2B3c4D5e6F70819293A4B5c6D7E8F901234567', 1_000_000n);
```

`encodeErc20Transfer` is also what a tz1-source ERC-20 send routes through
the gateway — what's signed is a real ABI `transfer(address,uint256)`.

### `trackCrossRuntimeStatus` — follow it to finality

```ts
for await (const status of trackCrossRuntimeStatus(txHash, 'evm-to-michelson', transport)) {
  render(status.stage);
  // broadcasting → included-source → included-target → finalized
  // or: failed | unresolved-target
}
```

Polls the EVM RPC every 2 s (up to 60 attempts per phase). `included-target`
follows `included-source` immediately — the precompile executes synchronously
during EVM execution. `finalized` = ≥ 2 confirmations. Only the
`evm-to-michelson` direction is served (anything else throws `-32601`); the
other direction's tracking is
[`resolveSyntheticHash`](./provider#wallet-host-methods).

## Alias mapping

```ts
import { deriveEvmAlias, resolveTezosAddress } from '@tezosx/relayer/utils/derive';

const alias = await deriveEvmAlias('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx'); // → '0x…'
const tz1   = await resolveTezosAddress(alias);                              // → 'tz1…'
```

The mapping lives on the node (`tez_getTezosEthereumAddress` /
`tez_getEthereumTezosAddress`) — there is no local derivation. It is
deterministic and immutable per address: cache it forever. Both calls hit the
default EVM RPC and carry the 15 s read deadline.

## Synthetic hash derivation

```ts
import { l1OpHashToEvmHash } from '@tezosx/relayer/use-cases/build-synthetic-receipt';

l1OpHashToEvmHash('oo6JPE…'); // → '0x…' — keccak256 of the operation-hash string
```

Pure and offline — what the provider returns from `eth_sendTransaction`
before the kernel-synthesized transaction is found. Useful for matching a
Michelson operation to its EVM mirror (the wallet's Activity feed does
exactly this).

## `TezlinkClient` — typed EVM RPC without the provider

```ts
import { TezlinkClient } from '@tezosx/relayer/tezlink';

const tezlink = new TezlinkClient();       // defaults to the EVM RPC constant
await tezlink.getBalance('0x…');           // hex wei
await tezlink.getTransactionReceipt('0x…');
await tezlink.getBlockByNumber('latest');
await tezlink.proxy('eth_getLogs', [{ /* … */ }]); // raw passthrough (deadline-exempt)
```

Use it for reads when you don't need a wallet session at all — a public
balance widget, an indexer. `proxy()` is an unrestricted passthrough to the
node; prefer the typed methods where they exist.
