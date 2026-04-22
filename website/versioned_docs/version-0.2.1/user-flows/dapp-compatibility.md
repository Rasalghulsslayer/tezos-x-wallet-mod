---
id: dapp-compatibility
title: dApp Compatibility
sidebar_position: 4
---

# dApp Compatibility

## Tested dApps

| dApp | Status | Wallet mechanism | Notes |
|---|---|---|---|
| Etherlink Faucet (shadownet) | ✅ Working | `window.ethereum` + EIP-6963 | Fully functional |
| IguanaDEX | ✅ Working | `window.ethereum` | Requires testnet mode enabled in IguanaDEX settings |
| Hanji | ❌ Not connecting | Privy (EIP-6963) | Wallet detected via EIP-6963, but connection fails — investigation ongoing |
| Superlend | ✅ Working | wagmi | EIP-6963 |
| Uniswap | ❌ No testnet | — | No shadownet support |

## Known limitations

**Hanji**
The relayer is correctly detected by Privy via EIP-6963, but the wallet connection does not complete. Current hypothesis: Hanji has no testnet/shadownet mode — contracts are only deployed on mainnet. We are investigating whether the issue is network-side or connection-side.

**MetaMask conflict**
If MetaMask is installed, it locks `window.ethereum` with `configurable: false`. Workaround: disable MetaMask on the site via its extension menu.

**CSP restrictions**
Pages with strict Content Security Policy may block Tampermonkey's inline script injection. Solution: use the Chrome Extension injection method (roadmap).

**eth_call not supported**
Reading contract state via `eth_call` is not yet implemented. Reads must go through the Tezlink JSON-RPC directly.

**Temple mobile only**
The Beacon wallet connection works with Temple mobile (QR code) only. The Temple browser extension connection is not yet supported.

## Wallet detection by stack

| dApp stack | Detection method | Relayer visible |
|---|---|---|
| Raw `window.ethereum` | Direct property | ✅ |
| wagmi v1 | `window.ethereum` | ✅ |
| wagmi v2 + RainbowKit | EIP-6963 | ✅ |
| ConnectKit | EIP-6963 | ✅ |
| Privy | EIP-6963 | ✅ Detected as injected wallet |
| WalletConnect only | QR code protocol | ❌ Out of scope |
