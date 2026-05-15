---
id: intro
title: TezosX Wallet
sidebar_label: Introduction
slug: /intro
---

# TezosX Wallet

**TezosX Wallet** is a standalone Chrome extension that gives you a self-custodied Tezos X account — Michelson (`tz1`) or EVM-native (`0x`) — and lets Ethereum-compatible dApps interact with the Tezos X network without requiring Temple or any other external wallet.

## What it is

TezosX Wallet holds your keypair locally, signs transactions itself, and exposes `window.ethereum` (EIP-1193) to every web page. From a dApp's perspective it looks like any Ethereum wallet: connect, sign, receive receipts.

Since **version 0.7.0** the wallet is **symmetric**: at onboarding you pick a runtime kind and the wallet binds the right keypair, signing primitives, and routing rules to it.

| Account kind | Key material | Signs | Receives |
|---|---|---|---|
| **Michelson** | BIP-39 mnemonic → ed25519 (`tz1…`) | Michelson operations via Taquito | XTZ on L1, ERC-20 on its derived EVM alias |
| **EVM** | 32-byte secp256k1 (`0x…`) | EIP-1559 transactions directly | Native XTZ on L2, ERC-20 on L2 |

Internally, the wallet picks the right path for each transfer based on the active account's kind and the destination address format.

**From a Michelson (`tz1`) account:**

- **XTZ to another Tezos address** (`tz1 → tz1 / tz2 / tz3 / KT1`) — emitted as a **native Michelson operation** via Taquito, no NAC gateway involved.
- **XTZ to a 0x address** (`tz1 → 0x`) — wrapped as a Michelson op targeting the **NAC gateway**'s `default` entrypoint at `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`. *Note*: EVM aliases of Tezos accounts cannot hold native XTZ — the kernel's `AliasForwarder` reroutes any XTZ sent to such an alias back to its tz1 of origin. This path is most useful when the recipient is an EVM-native account or an alias of a known tz1.
- **USDC and any dApp-initiated EVM call** — routed through the NAC gateway's `call_evm` entrypoint, executed atomically by the Tezos X kernel on the EVM runtime.

**From an EVM-native (`0x`) account:**

- **XTZ to another 0x address** (`0x → 0x`) — signed as a standard EIP-1559 type-`0x02` transaction and broadcast directly to the Tezlink EVM RPC. No NAC involvement; native L2 transfer.
- **XTZ to a Tezos address** (`0x → tz1 / KT1`) — signed as an EIP-1559 transaction calling the **NAC precompile** at `0xff00000000000000000000000000000000000007`. The kernel atomically forwards the value to the receiving tz1.
- **dApp signature requests** (`personal_sign`, `eth_signTypedData_v4`) — gated by the wallet's approval popup; signed locally with the user's secp256k1 key.

## How it differs from the Relayer extension

| | TezosX Wallet | TezosX Relayer |
|---|---|---|
| **Signing** | Built-in — keys stored locally | Delegates to Temple Wallet |
| **Account kinds** | Michelson (tz1) **and** EVM-native (0x) | Michelson (tz1) only |
| **Dependencies** | None (self-contained) | Requires Temple |
| **Target user** | End users who want a standalone wallet | Developers testing with Temple |
| **EIP-1193 provider** | `window.ethereum` (MAIN world) | `window.ethereum` (MAIN world) |
| **dApp compatibility** | Same as Relayer | Same as Wallet |

## Features

- **Create or import** at onboarding:
  - Michelson account from a BIP-39 mnemonic (12–24 words) or a Tezos secret key (`edsk…`).
  - EVM-native account from a generated 32-byte private key or an imported hex private key (with or without the `0x` prefix).
- **AES-256-GCM encrypted vault** protected by your password (PBKDF2-SHA-256, 200 000 iterations). Forward-compatible multi-account format since 0.7.0.
- **View balances** — XTZ and USDC on Tezos X Previewnet, on the correct runtime for the active account.
- **Send XTZ** across all four source × destination combinations (`tz1 → tz1`, `tz1 → 0x`, `0x → 0x`, `0x → tz1`); routing is auto-detected from the recipient address.
- **dApp approval popups** for connection, transaction, and signature requests.
- **Manage connected sites** — view and revoke per-origin sessions.
- **EIP-6963** multi-wallet discovery support.

## Start here

- [Install the wallet →](./installation)
- [Create a new wallet →](./user-flows/create-wallet)
- [Architecture overview →](./architecture/overview)
