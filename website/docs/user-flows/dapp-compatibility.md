---
id: dapp-compatibility
title: dApp Compatibility
sidebar_position: 4
---

# dApp Compatibility

## Tested dApps

| dApp | Status | Wallet mechanism | Notes |
|---|---|---|---|
| Tezos X EVM Faucet | ✅ Working | `window.ethereum` + EIP-6963 | Fully functional (first tested on the legacy shadownet, before the Previewnet rename) |
| IguanaDEX | ✅ Working | `window.ethereum` | Requires testnet mode enabled in IguanaDEX settings |
| Hanji | ❌ Not connecting | Privy (EIP-6963) | Wallet detected via EIP-6963, but connection fails — investigation ongoing |
| Superlend | ✅ Working | wagmi | EIP-6963 |
| Uniswap | ❌ No testnet | — | No Tezos X Previewnet support |

## Known limitations

**Hanji**
The relayer is correctly detected by Privy via EIP-6963, but the wallet connection does not complete. Current hypothesis: Hanji has no Previewnet mode — contracts are only deployed on mainnet. We are investigating whether the issue is network-side or connection-side. This is the only Privy-based dApp tested so far, so it is unclear whether the failure is Privy-generic or Hanji-specific.

**MetaMask conflict**
If MetaMask is installed, it locks `window.ethereum` with `configurable: false`. Workaround: disable MetaMask on the site via its extension menu.

**CSP restrictions**
Pages with strict Content Security Policy may block Tampermonkey's inline script injection. Solution: use the [Chrome Extension injection method](../technical/injection) — the recommended method since v0.2.0.

**Message signing**
`personal_sign`, `eth_sign` and `eth_signTypedData*` are rejected with EIP-1193 error `4200` — see [API Reference → Not supported](../technical/api-reference#not-supported). dApps whose login flow requires SIWE cannot complete it through the relayer.

**Temple pairing**
The Beacon pairing currently works with Temple mobile only — see [Connect Wallet](./connect-wallet) for the details and current status.

## Wallet detection by stack

| dApp stack | Detection method | Relayer visible |
|---|---|---|
| Raw `window.ethereum` | Direct property | ✅ |
| wagmi v1 | `window.ethereum` | ✅ |
| wagmi v2 + RainbowKit | EIP-6963 | ✅ |
| ConnectKit | EIP-6963 | ✅ |
| Privy | EIP-6963 | ✅ Detected as injected wallet (connection completion varies by dApp — see Hanji above) |
| WalletConnect only | QR code protocol | ❌ Out of scope |

## See also

- [EIP-6963 discovery](../architecture/eip6963) — how the relayer announces itself to wallet pickers
- [Injection methods](../technical/injection) — extension vs script tag vs userscript
- [Connect Wallet](./connect-wallet) — the Beacon/Temple pairing flow
