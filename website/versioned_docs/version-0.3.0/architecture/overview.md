---
id: overview
title: Overview
sidebar_position: 1
---

# Architecture Overview

The relayer sits between Etherlink dApps and the Tezos L1, acting as a translation layer that maps EVM calls to Tezos operations.

## Flow diagram

![Tezos X Relayer architecture diagram](/img/Tezosx_relayer.png)

## Components

| Component | Role |
|---|---|
| **RelayerProvider** | Implements `EIP1193Provider`, handles all `window.ethereum` calls |
| **BeaconClient** | Connects to Temple wallet via Beacon SDK |
| **TezlinkClient** | Sends operations to Tezos L1 via Tezlink RPC |
| **GatewayBuilder** | Builds Micheline calldata for the NAC gateway |
| **EIP-6963 announcer** | Broadcasts provider info for modern dApp wallet pickers |

## Address derivation

Every tz1 address has a deterministic EVM alias:

```
tz1 → SHA3(prefix + tz1_bytes) → 0xAlias
```

This alias is computed by the Tezlink RPC via `tez_getEthereumTezosAddress` and used as the account returned by `eth_requestAccounts`.

## Wallet variant

The **TezosX Wallet** extension uses the same `RelayerProvider` and `GatewayBuilder`, but replaces `BeaconClient` with `LocalSignerClient` — a self-contained signer that holds the Tezos secret key in service worker memory. This eliminates the Temple dependency entirely.

See the [Wallet Architecture](/wallet/architecture/overview) for the full runtime boundary diagram specific to the wallet extension.
