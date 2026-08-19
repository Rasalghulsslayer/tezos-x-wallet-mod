# @tezosx/relayer

Cross-runtime SDK for Tezos X — encoders, builders, and an EIP-1193 provider
for both Tezos-native (tz1) and EVM-native (0x) consumer wallets.

The relayer is designed, versioned and consumed as an SDK; the
[Tezos X Wallet](../wallet) is its reference integration.

The package serves three distinct audiences:

| Consumer | What you get | Entry point |
|---|---|---|
| dApp page (integrator) | Nothing to import — your page talks to the injected EIP-1193 provider (EIP-6963 discovery / `window.ethereum`). The `@tezosx/wallet` extension injects one; the legacy IIFE bundle injects the Temple-backed one. | none |
| Tezos-native wallet (tz1 key) | A `window.ethereum`-compatible EIP-1193 provider that wraps your Tezos signer and routes EVM tx through the NAC gateway. | `@tezosx/relayer/tezos` |
| EVM-native wallet (0x key) | Encoders, the high-level `buildCrossRuntimeTx` builder, and a cross-runtime status tracker for calling Michelson via the NAC precompile. | `@tezosx/relayer/evm` |

The wallet modes share a runtime-agnostic domain layer (types, errors, intent
shapes) accessible via `@tezosx/relayer/types`.

In this monorepo, the package is consumed by `@tezosx/wallet-core` (the shared
wallet engine) and, through it, by both wallet shells — the `@tezosx/wallet`
Chrome extension and the `@tezosx/wallet-mobile` app.

## Getting the package

`@tezosx/relayer` is `"private": true` and **not published to npm** —
`npm install @tezosx/relayer` does not work. The `exports` map points at raw
TypeScript sources (`.ts`), so any consumer needs a TypeScript-aware toolchain.
Three practicable paths:

- **Workspace dependency inside this monorepo** — how `@tezosx/wallet-core`
  consumes it: declare `"@tezosx/relayer": "^0.8.0"` in a workspace package;
  npm workspaces resolves it to `packages/relayer`.
- **Vendor the `packages/relayer/` folder** into your own repo as a local
  package. Runtime dependencies the sources import: `viem` (ABI encoding +
  keccak), `eventemitter3` (the provider), `@airgap/beacon-sdk` (only if you
  use `BeaconClient`), `@taquito/rpc` (Micheline types, type-only).
- **dApp pages: no install.** Consume the injected provider instead (see the
  IIFE section below for the page-side test bundle).

## Tezos consumer mode

A wallet that holds a tz1 key wants to interact with EVM dApps that speak
`window.ethereum`. The relayer provides `RelayerProvider`, wrapping any
`ITezosWalletClient` implementation.

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';
import type { PendingOpsStore } from '@tezosx/relayer/tezos';
import type { ITezosWalletClient } from '@tezosx/relayer/wallet-client';

declare const myPendingOpsStore: PendingOpsStore;

// Temple/Beacon integration. The 2nd constructor argument is a
// PendingOpsStore: the provider rehydrates its synthetic → real hash
// resolution state on construction and persists it on each mutation, so
// resolution survives a lock, an account switch, or a service-worker
// eviction. Omit it only for an in-memory provider (tests) — without it,
// that state dies with the page.
const provider = new RelayerProvider(new BeaconClient(), myPendingOpsStore);

// Or implement ITezosWalletClient yourself for a custom signer:
class MyWalletClient implements ITezosWalletClient { /* 5 methods */ }
const provider2 = new RelayerProvider(new MyWalletClient(), myPendingOpsStore);

// window.ethereum-compatible EIP-1193 surface:
await provider.request({ method: 'eth_requestAccounts' });
await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    to:    '0x1a2B3c4D5e6F70819293A4B5c6D7E8F901234567', // canonical 40-hex address required
    value: '0xde0b6b3a7640000', // 1 XTZ — a whole number of mutez (1 mutez = 10^12 wei)
  }],
});
```

`RelayerProvider` exposes:
- `request(args)` — full EIP-1193 method router.
- `resolveSyntheticHash(syntheticHash)` — awaits the kernel-synthesized real
  EVM hash. Returns `null` on timeout (15 scan attempts, 2 s apart); call
  again to keep trying.
- `getPendingL1Hash(syntheticHash)` — synchronous accessor for the underlying
  Michelson operation hash (`o…`).
- `listPendingOps()` — read-only snapshot (`readonly PendingOpView[]`) of the
  cross-runtime ops broadcast against the NAC gateway whose kernel-synthesized
  EVM hash has not yet been resolved.

Events emitted: `accountsChanged`, `connect`, `disconnect`. (`chainChanged`
is part of the `EIP1193Provider` type but is never emitted — single chain.)

### Typed errors

`buildTezosToEvmCall` (used internally by `eth_sendTransaction`, and exported
for direct use) throws three typed errors, each translated to EIP-1193
`-32602` by `RelayerProvider`:

| Error | Thrown when |
|---|---|
| `UnknownSelectorError` | The calldata's 4-byte selector is not in the curated local allow-list (the ERC-20 surface, `callMichelson`, and a handful of dApp methods). There is no remote fallback — unknown selectors are rejected, and extending the list is a code change. |
| `SubMutezPrecisionError` | The wei value has a non-zero `% 10^12` remainder that would be silently floored away at the mutez boundary. |
| `InvalidDestinationError` | The `to` field is not a canonical `0x` address. |

The conversion rule itself is exported as `weiToMutezExact(wei)` so consumer
wallets can enforce the same no-silent-loss rule on their own transfer paths.

`l1OpHashToEvmHash(l1OpHash)` — the pure helper deriving the synthetic
EVM-style hash from a Michelson operation hash — is exported from
`@tezosx/relayer/tezos` and also from the dedicated
`@tezosx/relayer/use-cases/build-synthetic-receipt` path, which avoids pulling
the Beacon SDK into bundlers that can't resolve its Node-only imports
(e.g. React Native / Metro). The same rationale applies to
`@tezosx/relayer/utils/derive` and
`@tezosx/relayer/use-cases/build-tezos-to-evm-call`: never runtime-import the
`/tezos` barrel from React Native code — type-only imports are fine.

## EVM consumer mode

A wallet that holds a secp256k1 key signs EVM tx natively but wants to call
the NAC precompile to reach a Michelson account. Use the encoders + builder
+ status tracker directly.

```ts
import {
  encodeNacCall,
  buildCrossRuntimeTx,
  trackCrossRuntimeStatus,
  NAC_PRECOMPILE_ADDR,
  NAC_RECOMMENDED_GAS,
} from '@tezosx/relayer/evm';

// Low-level: encode calldata, build your own tx. A bare native transfer is a
// generic HTTP `call`: a POST (method = 1) to http://tezos/<tz1> with no
// headers and an empty body; the attached value is credited to the
// destination (converted wei → mutez by the kernel).
const calldata = encodeNacCall(
  'http://tezos/tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx',
  [],    // headers — { key, value } pairs (the NacHttpHeader param type is not re-exported yet)
  '0x',  // body
  1,     // HTTP method: POST
);
const tx = {
  to:       NAC_PRECOMPILE_ADDR,
  value:    1_000_000_000_000_000_000n,  // 1 XTZ in wei (mutez × 10^12)
  data:     calldata,
  gasLimit: NAC_RECOMMENDED_GAS.call,    // 3M
};

// High-level: let the relayer build the whole tx from a typed intent
const tx2 = await buildCrossRuntimeTx(
  {
    kind:        'transfer',
    destination: 'tz1KqTp…xZSx',
    amount:      1_000_000n,               // mutez; converted to wei internally
  },
  myEvmAddress,
  transport,                                // TransportPort
);

// Sign + broadcast through your wallet, then track the cross-runtime status:
const hash = await myEvmProvider.sendRawTransaction(signedRaw);

for await (const status of trackCrossRuntimeStatus(hash, 'evm-to-michelson', transport)) {
  // broadcasting → included-source → included-target → finalized
  console.log(status);
}
```

`encodeErc20Transfer(to, amount)` encodes a standard ERC-20
`transfer(address,uint256)` calldata (`amount` in the token's base units) —
used by consumer wallets so a tz1-source ERC-20 send routes a real ABI
transfer through the gateway.

### Intent kinds

`CrossRuntimeIntent` has three kinds:

- `{ kind: 'transfer', destination, amount }` — XTZ transfer to a tz1
  (`amount` in mutez). Encoded as a generic `call` HTTP POST to
  `http://tezos/<destination>`.
- `{ kind: 'call-michelson', destination, entrypoint, binaryMicheline,
  value? }` — call a Michelson contract entrypoint with binary-encoded
  Micheline parameters (produced by `octez-client convert data … from
  michelson to binary`, no 0x05 PACK prefix). Encoded as `callMichelson`.
- `{ kind: 'call-evm', destination, methodSig, abiParamsHex, value? }` —
  models the Michelson → EVM ABI-call direction at the intent level. The
  EVM-side builders (`buildCrossRuntimeTx` / `buildEvmToTezosCall`) reject it
  with `PrecompileError`; the tz1-source path builds those calls from a raw
  `EthTransactionRequest` via `buildTezosToEvmCall`.

## 0.8.0 — read deadlines

Read calls carry a 15 s deadline (`RPC_TIMEOUT_MS`) enforced via
AbortController. A timeout throws a plain
`Error("Request timed out after 15000ms calling <method>")` with **no**
EIP-1193 code — deliberately: a timeout is not a transport loss, and it should
route to retry copy, not disconnect handling. A real fetch failure or non-2xx
response throws with code `4900`. The unknown-method passthrough proxy opts
out of the deadline because it may carry writes — aborting after a broadcast
is worse than waiting.

## Public surface map

All 11 export subpaths (there are no wildcard exports):

```
@tezosx/relayer                    # side-effect IIFE entry — importing it injects
  └── window.ethereum + EIP-6963 announce (uuid 6cfb5e8b-…, rdns com.tezosx.relayer)
      with a Temple-backed provider. Never imported by SDK consumers; it is the
      basis of dist/relayer.iife.js.

@tezosx/relayer/tezos
  ├── RelayerProvider, BeaconClient, TezlinkClient
  ├── buildTezosToEvmCall, deriveEvmAlias, resolveTezosAddress
  ├── weiToMutezExact, l1OpHashToEvmHash
  ├── UnknownSelectorError, SubMutezPrecisionError, InvalidDestinationError
  └── types: EvmBlock, EvmTxSummary, PendingOp, PendingOpView,
             PendingOpsStore, PendingOpsSnapshot
      (PendingOpsStore/Snapshot live here only — not in /types)

@tezosx/relayer/evm
  ├── encodeNacCall, encodeNacCallMichelson, encodeErc20Transfer
  ├── buildCrossRuntimeTx (+ EvmCrossRuntimeTx type), buildEvmToTezosCall
  ├── trackCrossRuntimeStatus
  └── NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS

@tezosx/relayer/types
  ├── ITezosWalletClient, WalletPermissions
  ├── TransportPort, JsonRpcTransport
  ├── EIP-1193: RequestArguments, ProviderRpcError, ProviderConnectInfo, EIP1193Provider
  ├── Eth tx: EthTransactionRequest, EthTransactionReceipt
  ├── Cross-runtime: CrossRuntimeIntent, CrossRuntimeCall, GatewayCall,
  │                  PrecompileCall, PendingOp, PendingOpView
  ├── CrossTxStatus, RuntimeId, ChainConfig, AliasMapping
  └── RelayerError, GatewayError, PrecompileError

@tezosx/relayer/constants
  ├── TEZLINK_EVM_RPC, TEZOS_L1_RPC
  ├── NAC_CONTRACT, NAC_ENTRYPOINT, NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS
  ├── NAC_HTTP_POST, NAC_TEZOS_RUNTIME_URL, NAC_ETHEREUM_RUNTIME_URL
  └── RPC_TIMEOUT_MS
      (no chain-id constant: the chain id — 128064 / 0x1f440 on Previewnet —
       is fetched at runtime via eth_chainId)

@tezosx/relayer/provider           # deep path: RelayerProvider only
@tezosx/relayer/wallet-client      # ITezosWalletClient, WalletPermissions — THE extension point
@tezosx/relayer/tezlink            # TezlinkClient (+ EvmBlock, EvmTxSummary)
@tezosx/relayer/utils/derive       # deriveEvmAlias, resolveTezosAddress   (Metro-safe)
@tezosx/relayer/use-cases/build-tezos-to-evm-call
                                   # buildTezosToEvmCall, weiToMutezExact,
                                   # + the three typed errors               (Metro-safe)
@tezosx/relayer/use-cases/build-synthetic-receipt
                                   # l1OpHashToEvmHash                      (Metro-safe)
```

## Source layout

```
src/
├── domain/        # Pure types, value objects, error classes
├── ports/         # Interfaces (ITezosWalletClient, TransportPort, PendingOpsStore)
├── use-cases/     # Pure orchestration over ports
├── shared/        # Cross-cutting utilities (constants, abi, rpc, hex, keccak, async)
├── tezos/         # Tezos-consumer entry point
├── evm/           # EVM-consumer entry point
├── polyfills/     # IIFE-bundle browser polyfills (Node crypto shim)
└── index.ts       # IIFE entry: auto-injects window.ethereum
```

## IIFE bundle and Chrome extension

The package also ships an IIFE bundle at `dist/relayer.iife.js` that
auto-injects `window.ethereum` when loaded via a `<script>` tag in a host
page. This bundle uses the `BeaconClient` by default (and constructs the
provider without a pending-ops store — resolution state does not survive a
page reload) and is the basis of the Chrome MV3 extension under `extension/`
— a superseded proof of concept; the supported extension is `@tezosx/wallet`
(see [extension/README.md](extension/README.md)).

```bash
npm run build        # IIFE bundle
npm run build:ext    # Chrome MV3 extension
```

## CHANGELOG

See [CHANGELOG.md](./CHANGELOG.md).
