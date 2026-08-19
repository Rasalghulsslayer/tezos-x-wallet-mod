---
id: overview
title: SDK Overview
---

# The SDK at a glance

`@tezosx/relayer` 0.8.0 exposes eleven entry points. Everything documented in
this section is importable exactly as written; anything not listed here is
internal and may change without notice.

| Entry point | What's inside | Use it when |
|---|---|---|
| `@tezosx/relayer/tezos` | [`RelayerProvider`](./provider), [`BeaconClient`](./wallet-clients), `TezlinkClient`, [`buildTezosToEvmCall`](./cross-runtime) + its typed errors, `weiToMutezExact`, `deriveEvmAlias`, `resolveTezosAddress`, `l1OpHashToEvmHash`, the `PendingOpsStore` types | You hold a tz1 (or drive Temple) and want an EVM-facing provider — the main entry point |
| `@tezosx/relayer/evm` | [`buildCrossRuntimeTx`, `buildEvmToTezosCall`, the encoders, `trackCrossRuntimeStatus`](./cross-runtime#evm--michelson--tezosxrelayerevm), `NAC_PRECOMPILE_ADDR`, `NAC_RECOMMENDED_GAS` | You hold a 0x key and want to reach the Michelson runtime through the NAC precompile |
| `@tezosx/relayer/types` | The domain vocabulary: [`CrossRuntimeIntent`, `CrossTxStatus`, error classes, EIP-1193 types, `ITezosWalletClient`](./constants-and-types#types--tezosxrelayertypes) | Typing your own code against the SDK |
| `@tezosx/relayer/constants` | [RPC endpoints, the NAC gateway KT1 and precompile address, gas budgets, the read deadline](./constants-and-types#constants--tezosxrelayerconstants) | Anywhere you need the kernel-level addresses — never hardcode them |
| `@tezosx/relayer/provider` | `RelayerProvider` alone | Importing the class without the `/tezos` barrel's dependency graph |
| `@tezosx/relayer/wallet-client` | [`ITezosWalletClient`, `WalletPermissions`](./wallet-clients) | Implementing your own signer backend |
| `@tezosx/relayer/tezlink` | `TezlinkClient`, `EvmBlock`, `EvmTxSummary` | A typed JSON-RPC client for the EVM node, without the provider |
| `@tezosx/relayer/utils/derive` | `deriveEvmAlias`, `resolveTezosAddress` | tz1 ↔ 0x alias mapping, standalone ([Metro-safe](#react-native--metro)) |
| `@tezosx/relayer/use-cases/build-tezos-to-evm-call` | `buildTezosToEvmCall`, `weiToMutezExact`, the three typed errors | The tz1→EVM builder standalone ([Metro-safe](#react-native--metro)) |
| `@tezosx/relayer/use-cases/build-synthetic-receipt` | `l1OpHashToEvmHash` | Deriving a synthetic hash from a Michelson operation hash ([Metro-safe](#react-native--metro)) |
| `@tezosx/relayer` (bare) | Nothing to import — a **side-effect injector**: constructs a Beacon-backed provider, installs it on `window.ethereum`, announces it via EIP-6963 | Only as the bundled `dist/relayer.iife.js` page script — never `import` it in application code |

## Source-only, private

The exports map points at raw TypeScript sources: consumers need a
TS-aware toolchain, and the package is `"private": true` — it is not on npm.
[Installation](../installation) covers the three practicable ways to depend
on it. Runtime dependencies the sources pull in: `viem` (ABI encoding),
`eventemitter3` (the provider), `@airgap/beacon-sdk` (only if you use
`BeaconClient`).

## React Native / Metro

Never runtime-import the `/tezos` barrel from React Native code: it
re-exports `BeaconClient`, which drags the Beacon SDK and its Node-only
`crypto` import into the bundle — Metro/Hermes cannot resolve it. The three
deep paths above exist precisely for this: `utils/derive`,
`use-cases/build-tezos-to-evm-call` and `use-cases/build-synthetic-receipt`
are Beacon-free. Type-only imports from `/tezos` are safe (they are erased at
compile time) — that is what the mobile wallet does.

## Testing

The package ships a Vitest suite (`npm run test` from `packages/relayer`,
node environment): five suites covering the ABI encoders, both cross-runtime
builders, the synthetic-receipt derivation, and the synthetic-hash resolver,
under `src/**/__tests__/`.

## The reference integration

The Tezos X Wallet consumes this SDK through `@tezosx/wallet-core`: the
container wires `new RelayerProvider(signer, pendingOpsStore)` with its own
Taquito-backed `TezosSigner` (no Beacon), the Send flow drives
`eth_sendTransaction` + `resolveSyntheticHash`, and the Activity feed
consumes `listPendingOps` and `l1OpHashToEvmHash`. When in doubt about how a
piece is meant to be used, read those call sites — they compile against this
exact version.
