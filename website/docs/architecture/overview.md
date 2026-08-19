---
id: overview
title: Overview
sidebar_position: 1
---

# Architecture Overview

The relayer sits between Tezos X EVM dApps and the Michelson runtime, acting as a translation layer that maps EVM calls to Tezos operations.

## Flow diagram

![Tezos X Relayer architecture diagram](/img/Tezosx_relayer.png)

## Components

| Component | Role |
|---|---|
| **RelayerProvider** | Implements `EIP1193Provider`, handles all `window.ethereum` calls |
| **BeaconClient** | Connects to Temple wallet via Beacon SDK |
| **TezlinkClient** | Talks to the Tezlink EVM JSON-RPC node (reads, proxying, block scans) |
| **`buildTezosToEvmCall`** | Use-case function that builds the Micheline calldata for the NAC gateway (`call` for bare transfers, `call_evm` for ABI calls) |
| **`PendingOpsStore` port** | Optional per-account persistence for the provider's synthetic→real hash resolution state, injected by wallet hosts so resolution survives lock, account switch, and service-worker eviction |
| **`@tezosx/relayer/evm` entry point** | Serves EVM-native consumers: the NAC precompile encoders (`encodeNacCall`, `encodeNacCallMichelson`, `encodeErc20Transfer`), the `buildCrossRuntimeTx` builder, and the `trackCrossRuntimeStatus` tracker — see [Cross-runtime builders](../sdk/cross-runtime) |
| **EIP-6963 announcer** | Broadcasts provider info for modern dApp wallet pickers |

All EVM reads issued by these components run under a 15-second deadline
(`RPC_TIMEOUT_MS`); the unknown-method proxy passthrough is exempt because it
may carry writes — see
[Timeouts and transport errors](../sdk/provider#timeouts-and-transport-errors).

## Address derivation

Every tz1 address has a deterministic EVM alias. The relayer asks the Tezlink EVM node for it via the `tez_getTezosEthereumAddress` RPC (tz1 → `0x` alias) and uses the result as the account returned by `eth_requestAccounts`. The reverse mapping (`0x` alias → tz1) is exposed by the node as `tez_getEthereumTezosAddress`.

## Wallet variant

The **Tezos X Wallet** (extension and mobile) uses the same `RelayerProvider` and the same `buildTezosToEvmCall` builder, but instead of `BeaconClient` it passes its own `TezosSigner` — a self-contained Taquito-backed signer from `@tezosx/wallet-core` that implements the same `ITezosWalletClient` port. This eliminates the Temple dependency entirely. The wallet also injects a per-account `PendingOpsStore` into the provider so cross-runtime resolution state survives lock and service-worker eviction.

See the [Wallet Architecture](/wallet/architecture/overview) for the full runtime boundary diagram specific to the wallet extension.
