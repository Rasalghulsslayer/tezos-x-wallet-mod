---
id: import-wallet
title: Import a Wallet
sidebar_label: Import a Wallet
---

# Import a Wallet

If you already have a Tezos or EVM secret, you can restore it into TezosX Wallet. The Welcome screen's kind choice (Michelson runtime / EVM runtime) decides which import form you get; the flow validates the secret, encrypts it locally, and derives your identity.

## Three import paths

| Path | Input | Result |
|---|---|---|
| **Recovery phrase** (Tezos) | BIP-39 mnemonic, 12 / 15 / 18 / 21 / 24 words | `tz1` account at HD index 0; the phrase becomes the vault's wallet seed |
| **Tezos secret key** | `edsk…` Base58 secret key | Standalone `tz1` account (no derivation path — the key *is* the account) |
| **EVM private key** | 64-character hex, with or without the `0x` prefix | Standalone `0x` account |

All mnemonic words must be from the [English BIP-39 wordlist](https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt).

## Steps

1. Open the extension popup
2. On the Welcome screen, pick the account kind, then click **I have a recovery phrase** (Tezos) or **I have a private key** (EVM)
3. For Tezos imports, a toggle switches between **Recovery phrase** and **Private key** (`edsk…`) modes
4. Paste your secret into the text area
5. Enter a new local password (minimum 8 characters) and confirm it
6. Click **Import wallet**

The wallet validates the secret before proceeding. If a mnemonic word is invalid or the checksum fails — or an `edsk…` / hex key doesn't decode — an error is shown inline. Your secret never leaves the device.

## What happens internally

```
mnemonic  ──isValidMnemonic()──►  validated
password  ──PBKDF2-SHA256 (600 000 iterations)──►  derivedKey
payload   ──AES-256-GCM──►  ciphertext  ──►  chrome.storage.local
mnemonic  ──BIP-39 seed──►  SLIP-10 ed25519 (m/44'/1729'/0'/0')
                         ──►  { tz1, publicKey }  (signing key derived on demand)
```

The validation uses `@scure/bip39`'s `validateMnemonic(mnemonic, wordlist)`. The derivation path is `m/44'/1729'/0'/0'` — the standard Tezos account path (BIP-44 coin type 1729), at HD index 0.

The three paths map to the keyring methods `importFromMnemonic`, `importFromSecretKey`, and `importFromEvmPrivkey` in `packages/core/src/background/keyring.ts`.

:::info Only a phrase import seeds derived accounts
An imported recovery phrase is stored as the vault's **wallet seed**, so **Add account** can later derive more accounts from it (see [Multi-account vaults](./multi-account)). An `edsk…` or EVM private-key import creates a standalone account with no wallet seed — the derived-account cards stay hidden until a phrase-backed account exists.
:::

## Derived addresses

After a Tezos import you will see two addresses on the [Home](./view-balances) screen:

| Address | Format | Purpose |
|---|---|---|
| **tz1…** | Base58Check, 36 chars | Michelson runtime — used for signing operations |
| **EVM alias** | `0x…` hex, 42 chars | Tezos X EVM runtime — shown to dApps as `eth_accounts` |

The EVM alias is derived deterministically from your tz1 address via the Tezlink `tez_getTezosEthereumAddress` RPC call. It is not a separate key — it is a representation of the same underlying ed25519 key pair on the EVM runtime side.

An imported EVM private key yields a single `0x` address — a native EVM account, not an alias.

## Password scope

The password you set during import is **specific to this device**. It protects the locally encrypted vault. It is not your Tezos wallet password (if you had one) and is not stored anywhere.

You can set a different password than the one you used on another device — only the secret must match. To change the password later, use **Settings → Change password** — it re-seals the vault without touching your secrets or addresses, no re-import needed (see [Settings](./settings#change-password)).

Import is also where **forgot-password recovery** lands: the Unlock screen's *Forgot password? Reset & re-import* path erases the encrypted vault — the password is the only key to it — and returns here so you can start over from your recovery phrase. Only **seed-derived accounts** come back at their original addresses; separately imported `edsk…` or EVM private keys are not covered by the phrase and must be re-imported on their own. See [Password lifecycle](../technical/security-model#password-lifecycle).

## See also

- [Create a Wallet](./create-wallet) — generate a fresh phrase or EVM key instead
- [Multi-account vaults](./multi-account) — add more accounts to an existing vault
- [Settings](./settings) — Reveal secret and Reveal seed phrase
