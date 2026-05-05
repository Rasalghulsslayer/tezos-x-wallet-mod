---
id: intro
title: Introduction
sidebar_position: 1
---

# Tezos X Relayer

The **Tezos X Relayer** is an injectable TypeScript script that implements [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) and [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), enabling Tezos users to interact with Etherlink dApps **without an EVM account**.

> Connect to Hanji, Superlend, or any Etherlink dApp using only your Temple wallet and a tz1 address.

## How it works

1. The relayer injects `window.ethereum` into any web page
2. When a dApp calls `eth_requestAccounts`, it opens Temple via the Beacon protocol
3. Your tz1 address is deterministically mapped to an EVM alias (`0x...`)
4. Transactions are routed through the **NAC gateway** on Tezos L1, forwarded atomically to the Etherlink kernel

## Status

| | |
|---|---|
| Network | Etherlink Shadownet (testnet) |
| Wallet | Temple (extension + mobile) |
| Protocol | EIP-1193 + EIP-6963 |
| Stage | POC / MVP |

## Links

- [GitLab Repository](https://github.com/trilitech/tezos-x-wallet)
- [Etherlink Documentation](https://docs.etherlink.com)
- [Tezos X Overview](https://tezos.com)
