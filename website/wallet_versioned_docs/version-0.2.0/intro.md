---
id: intro
title: TezosX Wallet
sidebar_label: Introduction
slug: /intro
---

# TezosX Wallet

**TezosX Wallet** is a standalone Chrome extension that gives you a self-custodied Tezos account and lets Ethereum-compatible dApps interact with the Tezos X network — without requiring Temple or any other external wallet.

## What it is

TezosX Wallet holds your Tezos keypair locally, signs transactions itself, and exposes `window.ethereum` (EIP-1193) to every web page. From a dApp's perspective it looks like any Ethereum wallet: connect, sign, receive receipts.

Internally, every transaction is routed through the **NAC gateway** on Tezos L1 and executed by the Etherlink kernel, bridging the two runtimes transparently.

## How it differs from the Relayer extension

| | TezosX Wallet | TezosX Relayer |
|---|---|---|
| **Signing** | Built-in — keys stored locally | Delegates to Temple Wallet |
| **Dependencies** | None (self-contained) | Requires Temple |
| **Target user** | End users who want a standalone wallet | Developers testing with Temple |
| **EIP-1193 provider** | `window.ethereum` (MAIN world) | `window.ethereum` (MAIN world) |
| **dApp compatibility** | Same as Relayer | Same as Wallet |

## Features

- **Create or import** a BIP39 seed phrase (12–24 words)
- **AES-256-GCM encrypted vault** protected by your password
- **View balances** — XTZ and USDC on Tezos X testnet
- **Send XTZ** to any tz1/tz2/tz3/KT1 or 0x address
- **dApp approval popups** for connection and transaction requests
- **Manage connected sites** — view and revoke per-origin sessions
- **EIP-6963** multi-wallet discovery support

## Start here

- [Install the wallet →](./installation)
- [Create a new wallet →](./user-flows/create-wallet)
- [Architecture overview →](./architecture/overview)
