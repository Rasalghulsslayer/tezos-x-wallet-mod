---
id: intro
title: Introduction
sidebar_position: 1
---

# TezosX

**Tezos X** is one ledger with two runtimes — Michelson and EVM. This project ships two products that let Tezos users and dApps work across both runtimes, sharing the same NAC gateway architecture and EIP-1193 provider interface.

The relayer is designed, versioned and consumed as an **SDK**; the [TezosX Wallet](/wallet/intro) is its reference integration.

## Products

| | [TezosX Relayer](/docs/installation) | [TezosX Wallet](/wallet/intro) |
|---|---|---|
| **What it is** | Injectable EIP-1193 provider | Standalone wallet — Chrome extension and mobile app |
| **Signing** | Delegates to Temple Wallet | Built-in — keys stored locally |
| **Dependencies** | Requires Temple | None |
| **Best for** | Developers testing with Temple | End users wanting a self-contained wallet |
| **Version** | [Relayer CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/relayer/CHANGELOG.md) | [Wallet CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/CHANGELOG.md) · [Mobile CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/mobile/CHANGELOG.md) |

The standalone wallet comes in two form factors — a Chrome MV3 extension and a mobile app — both built on the same shared core (`@tezosx/wallet-core`) and consuming this relayer for cross-runtime transactions. See [Wallet — Introduction](/wallet/intro).

## Relayer — how it works

The **Tezos X Relayer** implements [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) and [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), enabling Tezos users to interact with **Tezos X EVM dApps** without an EVM account.

> Connect to any Tezos X EVM dApp using only your Temple wallet and a tz1 address.

1. The relayer injects `window.ethereum` into any web page
2. When a dApp calls `eth_requestAccounts`, it opens Temple via the Beacon protocol
3. Your tz1 address is deterministically mapped to an EVM alias (`0x...`)
4. Transactions are routed through the **NAC gateway** on the Michelson runtime, forwarded atomically to the Tezos X kernel and executed on the EVM runtime

## Status

| | |
|---|---|
| Network | Tezos X Previewnet |
| Protocol | EIP-1193 + EIP-6963 |
| Distribution | Chrome/Brave/Firefox MV3 extension |
| Stage | MVP (testnet only) |

## Links

- [GitHub Repository](https://github.com/trilitech/tezos-x-wallet)
- [Tezos X Overview](https://tezos.com)
