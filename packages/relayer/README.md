# @tezosx/relayer

Cross-runtime SDK for Tezos X — encoders, builders, and an EIP-1193 provider
for both Tezos-native (tz1) and EVM-native (0x) consumer wallets.

The package serves two distinct consumer modes:

| Consumer | What you get | Entry point |
|---|---|---|
| Tezos-native wallet (tz1 key) | A `window.ethereum`-compatible EIP-1193 provider that wraps your Tezos signer and routes EVM tx through the NAC gateway. | `@tezosx/relayer/tezos` |
| EVM-native wallet (0x key) | Encoders, the high-level `buildCrossRuntimeTx` builder, and a cross-runtime status tracker for calling Michelson via the NAC precompile. | `@tezosx/relayer/evm` |

Both modes share a runtime-agnostic domain layer (types, errors, intent
shapes) accessible via `@tezosx/relayer/types`.

## Install

```bash
npm install @tezosx/relayer
```

Currently distributed as a workspace package inside the
[tezos-x-wallet monorepo](https://github.com/trilitech/tezos-x-wallet); not
yet on the public npm registry.

## Tezos consumer mode

A wallet that holds a tz1 key wants to interact with EVM dApps that speak
`window.ethereum`. The relayer provides `RelayerProvider`, wrapping any
`ITezosWalletClient` implementation.

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';
import type { ITezosWalletClient } from '@tezosx/relayer/types';

// Temple/Beacon integration:
const walletClient: ITezosWalletClient = new BeaconClient();
const provider = new RelayerProvider(walletClient);

// Or implement ITezosWalletClient yourself for a custom signer:
class MyLocalSigner implements ITezosWalletClient { /* ... */ }
const provider2 = new RelayerProvider(new MyLocalSigner());

// window.ethereum-compatible EIP-1193 surface:
await provider.request({
  method: 'eth_sendTransaction',
  params: [{ to: '0x...', value: '0x1f4' }],
});
```

`RelayerProvider` exposes:
- `request(args)` — full EIP-1193 method router.
- `resolveSyntheticHash(syntheticHash)` — awaits the kernel-synthesized real
  EVM hash. Returns `null` on timeout.
- `getPendingL1Hash(syntheticHash)` — synchronous accessor for the underlying
  L1 op hash.

## EVM consumer mode

A wallet that holds a secp256k1 key signs EVM tx natively but wants to call
the NAC precompile to reach a Michelson account. Use the encoders + builder
+ status tracker directly.

```ts
import {
  encodeNacTransfer,
  buildCrossRuntimeTx,
  trackCrossRuntimeStatus,
  NAC_PRECOMPILE_ADDR,
  NAC_RECOMMENDED_GAS,
} from '@tezosx/relayer/evm';

// Low-level: encode calldata, build your own tx
const calldata = encodeNacTransfer('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx');
const tx = {
  to:       NAC_PRECOMPILE_ADDR,
  value:    1_000_000_000_000_000_000n,    // 1 XTZ in wei
  data:     calldata,
  gasLimit: NAC_RECOMMENDED_GAS.transfer,  // 3M
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

`CrossRuntimeIntent` supports two kinds for the EVM-to-Michelson direction:
- `{ kind: 'transfer', destination, amount }` — XTZ transfer to a tz1
  (`amount` in mutez).
- `{ kind: 'call-michelson', destination, entrypoint, binaryMicheline,
  value? }` — call a Michelson contract entrypoint with binary-encoded
  Micheline parameters (produced by `octez-client convert data … from
  michelson to binary`, no 0x05 PACK prefix).

## Public surface map

```
@tezosx/relayer/tezos
  ├── RelayerProvider, BeaconClient, TezlinkClient
  ├── buildTezosToEvmCall, deriveEvmAlias, resolveTezosAddress
  └── EvmBlock, EvmTxSummary (types)

@tezosx/relayer/evm
  ├── encodeNacTransfer, encodeNacCallMichelson
  ├── buildCrossRuntimeTx, buildEvmToTezosCall
  ├── trackCrossRuntimeStatus
  └── NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS

@tezosx/relayer/types
  ├── ITezosWalletClient, WalletPermissions
  ├── TransportPort, JsonRpcTransport
  ├── EIP-1193: RequestArguments, ProviderRpcError, ProviderConnectInfo, EIP1193Provider
  ├── Eth tx: EthTransactionRequest, EthTransactionReceipt
  ├── Cross-runtime: CrossRuntimeIntent, CrossRuntimeCall, GatewayCall, PrecompileCall
  ├── CrossTxStatus, RuntimeId, ChainConfig, AliasMapping
  └── RelayerError, GatewayError, PrecompileError
```

## Source layout

```
src/
├── domain/        # Pure types, value objects, error classes
├── ports/         # Interfaces (ITezosWalletClient, TransportPort)
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
page. This bundle uses the `BeaconClient` by default and is the basis of the
Chrome MV3 extension under `extension/`.

```bash
npm run build        # IIFE bundle
npm run build:ext    # Chrome MV3 extension
```

## CHANGELOG

See [CHANGELOG.md](./CHANGELOG.md).