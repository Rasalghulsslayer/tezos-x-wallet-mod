---
id: intro
title: TezosX Wallet
sidebar_label: Introduction
slug: /intro
---

# TezosX Wallet

**TezosX Wallet** is a self-custodied wallet for Tezos X — Michelson (`tz1`) or EVM-native (`0x`) accounts — that lets Ethereum-compatible dApps interact with the Tezos X network without requiring Temple or any other external wallet.

## What it is

TezosX Wallet holds your keys locally, signs transactions itself, and exposes `window.ethereum` (EIP-1193) to every web page. From a dApp's perspective it looks like any Ethereum wallet: connect, sign, receive receipts.

Since **version 0.7.0** the wallet is **symmetric**: at onboarding you pick a runtime kind and the wallet binds the right keypair, signing primitives, and routing rules to it.

| Account kind | Key material | Signs | Receives |
|---|---|---|---|
| **Michelson** | BIP-39 mnemonic → ed25519 (`tz1…`) | Michelson operations via Taquito | XTZ on the Michelson runtime; ERC-20 on its derived EVM alias |
| **EVM** | 32-byte secp256k1 (`0x…`) | EIP-1559 transactions directly | Native XTZ and ERC-20 on the EVM runtime |

Internally, the wallet picks the right path for each transfer based on the active account's kind and the destination address format.

**From a Michelson (`tz1`) account:**

- **XTZ to another Tezos address** (`tz1 → tz1 / tz2 / tz3 / KT1`) — emitted as a **native Michelson operation** via Taquito, no NAC gateway involved.
- **XTZ to a 0x address** (`tz1 → 0x`) — wrapped as a Michelson op targeting the **NAC gateway**'s generic `call` entrypoint (a `%call` HTTP request: a POST to `http://ethereum/<0x>` with an empty body) at `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`. (The hard-coded `%default` helper this used to target was removed in the Tezos X release candidate.) *Note*: EVM aliases of Tezos accounts cannot hold native XTZ — the kernel's `AliasForwarder` reroutes any XTZ sent to such an alias back to its tz1 of origin. This path is most useful when the recipient is an EVM-native account or an alias of a known tz1.
- **USDC and any dApp-initiated EVM call** — routed through the NAC gateway's `call_evm` entrypoint, executed atomically by the Tezos X kernel on the EVM runtime.

**From an EVM-native (`0x`) account:**

- **XTZ to another 0x address** (`0x → 0x`) — signed as a standard EIP-1559 type-`0x02` transaction and broadcast directly to the Tezlink EVM RPC. No NAC involvement; native EVM-runtime transfer.
- **XTZ to a Tezos address** (`0x → tz1 / KT1`) — signed as an EIP-1559 transaction calling the **NAC precompile** at `0xff00000000000000000000000000000000000007`. The kernel atomically forwards the value to the receiving tz1.
- **dApp signature requests** (`personal_sign`) — gated by the wallet's approval popup; signed locally with the user's secp256k1 key (EIP-191). `eth_signTypedData*` is not supported and is refused without prompting.

## Two form factors

The wallet ships on two surfaces that share the same core — vault format, accounts, signing, and use cases all live in the `@tezosx/wallet-core` package:

- **Chrome extension** — injects `window.ethereum` into every page; dApps connect directly. [Install →](./installation)
- **Mobile app** — a React Native app that pairs with dApps over **WalletConnect** (QR scan or `wc:` URI) instead of page injection. [Quickstart →](./mobile/quickstart) · [WalletConnect pairing →](./mobile/walletconnect)

A vault created on one surface uses the same encrypted format as the other.

## How it differs from the Relayer extension

| | TezosX Wallet | TezosX Relayer |
|---|---|---|
| **Signing** | Built-in — keys stored locally | Delegates to Temple Wallet |
| **Account kinds** | Michelson (tz1) **and** EVM-native (0x) | Michelson (tz1) only |
| **Dependencies** | None (self-contained) | Requires Temple |
| **Target user** | End users who want a standalone wallet | Developers testing with Temple |
| **EIP-1193 provider** | `window.ethereum` (MAIN world) | `window.ethereum` (MAIN world) |
| **dApp compatibility** | Identical (same EIP-1193 request surface) | Identical (same EIP-1193 request surface) |

dApps built against one work unchanged with the other — the two extensions expose the same EIP-1193 request surface.

## Features

- **Create or import** at onboarding:
  - Michelson account from a BIP-39 mnemonic (12–24 words) or a Tezos secret key (`edsk…`).
  - EVM-native account from a generated 32-byte private key or an imported hex private key (with or without the `0x` prefix).
- **Multiple accounts in one vault** — derive additional Michelson or EVM accounts from your wallet seed (next unused HD index, nothing new to back up), or import standalone keys. Up to 50 accounts, with per-account labels and switching. See [Multiple accounts](./user-flows/multi-account).
- **AES-256-GCM encrypted vault** protected by your password (PBKDF2-SHA-256, 600 000 iterations). Multi-account format with an optional wallet-level HD seed.
- **View balances** — XTZ and any registered ERC-20 (USDC seeded by default) on Tezos X Previewnet, on the correct runtime for the active account.
- **Custom ERC-20 tokens** since 0.10.0 — paste any ERC-20 contract address; the wallet reads `symbol` / `decimals` / `name` from chain and renders the token like a native asset across Home, Send, and Activity. Up to 30 per account.
- **Send XTZ and any registered ERC-20** across the valid source × destination combinations (`tz1 → tz1`, `tz1 → 0x`, `0x → 0x`, `0x → tz1` for native XTZ; ERC-20s are EVM-runtime only); routing is auto-detected from the recipient address.
- **dApp approval popups** for connection, transaction, and signature requests.
- **Manage connected sites** — view and revoke per-origin sessions.
- **EIP-6963** multi-wallet discovery support.

## Start here

- [Install the wallet →](./installation)
- [Create a new wallet →](./user-flows/create-wallet)
- [Multiple accounts & HD derivation →](./user-flows/multi-account)
- [Architecture overview →](./architecture/overview)
