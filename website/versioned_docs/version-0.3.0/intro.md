---
id: intro
title: Introduction
sidebar_position: 1
---

# TezosX

**TezosX** bridges Tezos to the Ethereum ecosystem. It ships two products that share the same NAC gateway architecture and EIP-1193 provider interface.

## Products

| | [TezosX Relayer](/docs/installation) | [TezosX Wallet](/wallet/intro) |
|---|---|---|
| **What it is** | Injectable EIP-1193 provider | Standalone Chrome extension wallet |
| **Signing** | Delegates to Temple Wallet | Built-in — keys stored locally |
| **Dependencies** | Requires Temple | None |
| **Best for** | Developers testing with Temple | End users wanting a self-contained wallet |
| **Version** | 0.3.0 | 0.1.0 |

## Relayer — how it works

The **Tezos X Relayer** implements [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) and [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), enabling Tezos users to interact with Etherlink dApps **without an EVM account**.

> Connect to Hanji, Superlend, or any Etherlink dApp using only your Temple wallet and a tz1 address.

1. The relayer injects `window.ethereum` into any web page
2. When a dApp calls `eth_requestAccounts`, it opens Temple via the Beacon protocol
3. Your tz1 address is deterministically mapped to an EVM alias (`0x...`)
4. Transactions are routed through the **NAC gateway** on Tezos L1, forwarded atomically to the Etherlink kernel

## Status

| | |
|---|---|
| Network | Tezos X Testnet |
| Protocol | EIP-1193 + EIP-6963 |
| Distribution | Chrome/Brave/Firefox MV3 extension |
| Stage | MVP (testnet only) |

## Links

- [GitLab Repository](https://github.com/trilitech/tezos-x-wallet)
- [Etherlink Documentation](https://docs.etherlink.com)
- [Tezos X Overview](https://tezos.com)
