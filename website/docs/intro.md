---
id: intro
title: Introduction
sidebar_position: 1
---

# Tezos X Relayer

**Tezos X** is one ledger with two runtimes — Michelson and EVM. `@tezosx/relayer` is the SDK that lets a Tezos account (tz1) drive EVM dApps, and EVM accounts reach Michelson contracts, across that boundary. It wraps a Tezos signer behind a standard [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) provider, routes `eth_sendTransaction` through the **NAC** (Native Atomic Composability) **gateway** on the Michelson side, and resolves the kernel-synthesized EVM transaction hash so the dApp sees a normal-looking flow.

The relayer is designed, versioned and consumed as an **SDK**; the [Tezos X Wallet](/wallet/intro) is its reference integration.

## Who this is for

The package serves three distinct audiences:

| You are | What you use | Where to start |
|---|---|---|
| **A dApp developer** — you want Temple (or Tezos X Wallet) users to sign transactions on the EVM runtime | Nothing to import: your page talks to the injected EIP-1193 provider via [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) discovery or `window.ethereum` | [Quickstart](./quickstart), then [dApp compatibility](./user-flows/dapp-compatibility) for provider discovery |
| **A Tezos-native wallet builder** — you hold tz1 keys and want to expose an EVM-facing provider | `RelayerProvider` from `@tezosx/relayer/tezos`, plus an `ITezosWalletClient` implementation | [Quickstart](./quickstart), then [Wallet clients](./sdk/wallet-clients) |
| **An EVM-native wallet builder** — you hold 0x keys and want to call Michelson via the NAC precompile | The encoders, `buildCrossRuntimeTx` and `trackCrossRuntimeStatus` from `@tezosx/relayer/evm` | [Cross-runtime builders](./sdk/cross-runtime) |

Signing is pluggable. `RelayerProvider` wraps any implementation of the `ITezosWalletClient` interface (5 methods, exported from `@tezosx/relayer/wallet-client`). The bundled `BeaconClient` is **one** adapter: it drives Temple Wallet over the Beacon protocol. The shipped Tezos X Wallet does not use Beacon at all — it passes its own Taquito-backed signer. "Requires Temple" is a property of the `BeaconClient` adapter, not of the SDK.

## How it works (tz1 → EVM)

1. The dApp calls `eth_requestAccounts`; the wallet client prompts the user (with `BeaconClient`, this opens Temple via Beacon)
2. The user's tz1 address is deterministically mapped to an EVM alias (`0x…`) — a kernel mapping, fetched from the EVM node
3. `eth_sendTransaction` is rebuilt as a Michelson operation against the NAC gateway contract and signed by the wallet client on the Michelson runtime
4. The Tezos X kernel executes the call atomically on the EVM runtime and synthesizes a real EVM transaction; the relayer returns a synthetic hash immediately, then resolves the real one so receipts and explorer links work

Some of this machinery is visible from the dApp side — synthetic hashes, constant gas estimates, rejected signature methods. Read [Surprising behaviors](./gotchas) before debugging around them.

## Products

| | Tezos X Relayer | Tezos X Wallet |
|---|---|---|
| **What it is** | EIP-1193 provider SDK + cross-runtime encoders/builders | Standalone wallet — Chrome extension and mobile app |
| **Signing** | Delegates to a pluggable `ITezosWalletClient` — the bundled `BeaconClient` (Temple) or your own signer | Built-in — keys stored locally |
| **Distribution** | Workspace SDK inside this monorepo, consumed by the Tezos X Wallet (not on npm — see [Installation](./installation)). A legacy Temple-backed browser-extension PoC is kept for reference. | Chrome MV3 extension + Expo mobile app |
| **Best for** | dApp integrators and wallet builders | End users wanting a self-contained wallet |
| **Version** | 0.8.0 — [Relayer CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/relayer/CHANGELOG.md) | [Wallet CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/CHANGELOG.md) · [Mobile CHANGELOG](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/mobile/CHANGELOG.md) |

The standalone wallet comes in two form factors — a Chrome MV3 extension and a mobile app — both built on the same shared core (`@tezosx/wallet-core`) and consuming this relayer for cross-runtime transactions. See [Wallet — Introduction](/wallet/intro).

## Status

| | |
|---|---|
| Network | Tezos X Previewnet |
| Protocol | EIP-1193 + EIP-6963 |
| Distribution | Workspace SDK; consumed by `@tezosx/wallet` and `@tezosx/wallet-mobile` through `@tezosx/wallet-core` |
| Stage | MVP (testnet only) |

## Next steps

- [Installation](./installation) — how to actually get the SDK (and why `npm install` won't work)
- [Quickstart](./quickstart) — connect, send, and follow a transaction to its receipt
- [The SDK](./sdk/overview) — everything the package contains and when to use each piece
- [Surprising behaviors](./gotchas) — synthetic hashes, rejected signature methods, the alias forwarder, and the fee model
- [Architecture](./architecture/overview) — how the pieces fit

## Links

- [GitHub Repository](https://github.com/trilitech/tezos-x-wallet)
- [Tezos X Overview](https://tezos.com)
