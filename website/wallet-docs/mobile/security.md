---
id: security
title: Mobile Security
sidebar_label: Security
---

# Mobile Security

The mobile app shares the wallet's security model — vault envelope, keyring retention contract, unlock throttle — with the extension (see [Security Model](../technical/security-model)). This page covers what is specific to the phone: the OS keystore, native crypto, MMKV storage, auto-lock, and per-signature biometrics.

## Two-layer storage

**The encrypted vault blob lives in MMKV.** It is the same AES-256-GCM envelope the extension writes — PBKDF2-HMAC-SHA256 at 600,000 iterations, random salt and IV, ciphertext with a 16-byte GCM tag appended, no additional authenticated data — and it is byte-compatible: a vault sealed on mobile opens in the extension with the same password, and vice versa. On mobile the PBKDF2 derivation runs **natively** (`react-native-quick-crypto`, OpenSSL over Nitro/JSI) instead of in pure JavaScript, which brings unlock into the sub-second range; the derive runs off the JS thread. Randomness comes from the native OpenSSL CSPRNG. A byte-compatibility test pins the recipe against `node:crypto` in CI so envelope drift is caught.

**The unlock secret (the vault password) is sealed in the OS keystore** via `react-native-keychain`, behind biometrics:

- `BIOMETRY_CURRENT_SET` — the sealed item is bound to the *current* biometric enrolment. If the enrolment changes (a fingerprint added, Face ID re-enrolled), the OS invalidates the item and the wallet falls back to manual password entry.
- `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` — device-bound, requires a device passcode, and **never synced** to iCloud or any backup.
- `SECURE_HARDWARE` — hardware-backed storage is requested on Android.

Unlock flow: biometric prompt → the keystore releases the password → the keyring derives the vault key and decrypts the MMKV blob. The password is sealed (best-effort) after every successful unlock, create, or import; on devices without biometry the wallet is simply password-only.

The sealed item follows the vault's lifecycle:

- **Changing the password re-seals it with the new password in the same operation.** Once the vault only opens with the new password, the keystore must not keep releasing the old one. If sealing the new password fails (no enrolment, a keystore refusal), the item is **cleared instead** — biometrics degrade to manual password entry rather than replaying a stale password. Neither keystore outcome rolls back or fails the vault change itself.
- **A wallet reset removes the sealed secret** along with the vault — it must not survive the vault it opened.

See [Password lifecycle](../technical/security-model#password-lifecycle) for the shared model.

## What is — and is not — encrypted at rest

The vault blob (every secret: seeds, private keys) is AES-256-GCM encrypted before it touches MMKV. **Session, token, and contact metadata are currently stored in plaintext in MMKV** — per-origin dApp sessions, the custom-token registry, and the [address book](../user-flows/contacts), which contain no key material but do reveal usage metadata to anything that can read the app's storage. Wrapping the MMKV instance with an at-rest `encryptionKey` held in the Keychain is tracked as follow-up work (it needs an async composition-root bootstrap and a migration for existing installs).

## Auto-lock

Unlike the extension — where the MV3 service worker dying is itself a lock — mobile has a single long-lived JS thread, so the decrypted secret would linger in memory. The app evicts it on two triggers:

- **Backgrounding: immediate.** The moment the app state reaches `background`, the wallet locks. The transient `inactive` state is **deliberately ignored** — it fires for the Face ID sheet, the app-switcher peek, or a notification banner, and locking on it would kill the vault mid-biometric-unlock.
- **Foreground idle: 5 minutes.** Screens reset the timer on user interaction; five minutes without any locks the wallet.

Locking — manually, on idle, or on backgrounding — drops **every signer reference synchronously** in the same call: the container cache, the warm active-account container, and the alias caches. No scheduled cleanup is involved, so once lock returns, no code path leads back to a signer. Honest limits: JavaScript strings cannot be zeroized in place, so the guarantee is unreachability (then garbage collection) rather than erasure, and references held by an operation already in flight live until that operation settles.

## Per-signature biometric confirmation

Every signature — a Send confirmation or a WalletConnect `eth_sendTransaction` approval — is gated behind a biometric presence check, implemented by re-reading the biometry-gated keystore item (the released password is discarded; only the fact that the OS prompt succeeded matters). The check **fails closed** when biometrics are enrolled: a cancelled prompt, unavailable hardware mid-flow, or an invalidated enrolment blocks the signature. On a password-only device (nothing sealed to confirm against) it is a no-op, so signing is not blocked.

## Unlock throttle

Repeated wrong passwords arm the shared core's persisted unlock throttle (backed by MMKV on mobile), applying a capped lockout that survives app restarts — the same guard the extension uses.

## See also

- [Security Model](../technical/security-model) — the shared vault and keyring model
- [Quickstart](./quickstart) — dev-build requirements
- [WalletConnect](./walletconnect) — what a dApp session can and cannot request
