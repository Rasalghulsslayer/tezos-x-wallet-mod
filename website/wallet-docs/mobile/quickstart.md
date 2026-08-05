---
id: quickstart
title: Mobile App Quickstart
sidebar_label: Quickstart
---

# Mobile App Quickstart

`@tezosx/wallet-mobile` (0.2.0) is the Tezos X wallet for iOS and Android. It is **the same wallet core in a React Native shell**: the app consumes [`@tezosx/wallet-core`](../architecture/packages) over the npm workspace, so it runs the same keyring, the same use-cases, and the same routing as the Chrome extension. The vault format is byte-compatible — a vault sealed on mobile opens in the extension with the same password, and vice versa — and both account kinds exist on both surfaces: Michelson accounts (`tz1…`) and EVM accounts (`0x…`).

## Requirements — a development build, not Expo Go

The app is built on Expo SDK ~56 (React Native 0.85, React 19.2) but it ships native modules that Expo Go cannot load:

- `react-native-quick-crypto` — native (OpenSSL) vault crypto over Nitro/JSI
- `react-native-mmkv` — on-device storage
- `react-native-keychain` — the biometric-sealed unlock secret
- `expo-camera` — the WalletConnect QR scanner

You therefore need a **development build** compiled from the native projects, with Xcode (iOS) or the Android SDK/emulator installed.

## Run

```bash
# from the repo root (npm workspaces)
npm install

cd packages/mobile
npx expo run:ios        # or: npx expo run:android
```

`expo run:ios` / `expo run:android` compile the native project and install the dev build on the simulator or a connected device. Once a build is installed, `npx expo start` is enough for JavaScript-only iteration.

## WalletConnect project id

dApp connections go over WalletConnect v2 (Reown WalletKit), which needs a project id. Create one in the Reown dashboard and set it before launching:

```bash
# packages/mobile/.env.local
EXPO_PUBLIC_WC_PROJECT_ID=<your Reown project id>
```

WalletConnect boots when the wallet is unlocked and throws at startup if the variable is missing. See [WalletConnect](./walletconnect) for the pairing flows.

## Onboarding

Onboarding mirrors the extension:

- **Create** a Michelson account (fresh BIP-39 mnemonic → `tz1…`) or an EVM account (fresh key → `0x…`).
- **Import** an existing mnemonic, a Tezos secret key (`edsk…`), or an EVM hex private key (`0x…`).
- After the first successful unlock, create, or import, the password is sealed in the OS keystore behind biometrics (when the device has biometry enrolled), so later unlocks are **biometric-first** — Face ID / Touch ID releases the sealed password — with manual password entry always available as a fallback. See [Security](./security) for the keystore semantics.

## Extension vs mobile at a glance

| | Chrome extension | Mobile app |
|---|---|---|
| Shell | Popup (360×600) + Chrome side panel | Bottom tabs + modal stack (16 native screens) |
| dApp connection | EIP-6963 / injected `window.ethereum` | WalletConnect v2 (Reown WalletKit) |
| Storage | `chrome.storage` | MMKV (data) + OS Keychain (unlock secret) |
| Unlock | Password | Biometric-first (sealed password), password fallback |
| Vault crypto | Web Crypto | `react-native-quick-crypto` (native OpenSSL) |
| Auto-lock | 5-min idle deadline, system idle / worker suspend | Immediate on backgrounding + 5-min foreground idle |

Everything below the shell — vault envelope, account kinds, transfer routing, approval queue — is the shared core, documented once in the rest of this tree.

## See also

- [WalletConnect](./walletconnect) — pairing, session scope, disconnects
- [Security](./security) — keystore, auto-lock, per-signature biometrics
- [Packages](../architecture/packages) — how the four packages fit together
