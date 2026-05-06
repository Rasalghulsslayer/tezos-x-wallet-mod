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

Internally, the wallet picks the right path for each transfer:

- **XTZ to a Tezos address** (`tz1 → tz1 / tz2 / tz3 / KT1`) — emitted as a **native Michelson runtime operation** via Taquito, no NAC gateway involved.
- **XTZ to a 0x EVM alias** (`tz1 → 0x`) — wrapped as a Michelson op targeting the **NAC gateway**'s `default` entrypoint. *Note*: under Tezos X's account model, EVM aliases cannot hold native XTZ — the kernel's `AliasForwarder` reroutes any XTZ sent to a 0x alias back to its tz1 of origin. So this path is mostly useful when the recipient's tz1 isn't directly known to the sender.
- **USDC and any dApp-initiated EVM call** — routed through the NAC gateway's `call_evm` entrypoint, executed atomically by the Tezos X kernel on the EVM runtime.

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
- **View balances** — XTZ and USDC on Tezos X Previewnet
- **Send XTZ** to any tz1/tz2/tz3/KT1 or 0x address
- **dApp approval popups** for connection and transaction requests
- **Manage connected sites** — view and revoke per-origin sessions
- **EIP-6963** multi-wallet discovery support

## Start here

- [Install the wallet →](./installation)
- [Create a new wallet →](./user-flows/create-wallet)
- [Architecture overview →](./architecture/overview)
