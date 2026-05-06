---
id: import-wallet
title: Import a Wallet
sidebar_label: Import a Wallet
---

# Import a Wallet

If you already have a Tezos seed phrase, you can restore it into TezosX Wallet. The import flow validates the mnemonic, encrypts it locally, and derives your Tezos identity.

## Supported mnemonic lengths

BIP-39 mnemonics of 12, 15, 18, 21, or 24 words are accepted. All words must be from the [English BIP-39 wordlist](https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt).

## Steps

1. Open the extension popup
2. On the Welcome screen, click **Import an existing seed**
3. Paste your mnemonic into the text area (words separated by spaces)
4. Enter a new local password (minimum 8 characters)
5. Confirm the password
6. Click **Import wallet**

The wallet validates your mnemonic before proceeding. If any word is invalid or the checksum fails, an error is shown inline.

## What happens internally

```
mnemonic  ──isValidMnemonic()──►  validated
password  ──PBKDF2-SHA256──►  derivedKey
mnemonic  ──AES-256-GCM──►  ciphertext  ──►  chrome.storage.local
mnemonic  ──BIP-39 seed──►  SLIP-10 ed25519 (m/44'/1729'/0'/0')
                         ──►  { tz1, publicKey, secretKey }  (in memory only)
```

The validation uses `@scure/bip39`'s `validateMnemonic(mnemonic, wordlist)`. The derivation path is `m/44'/1729'/0'/0'` — the standard Tezos account path (BIP-44 coin type 1729).

## Derived addresses

After import you will see two addresses on the [Home](./view-balances) screen:

| Address | Format | Purpose |
|---|---|---|
| **tz1…** | Base58Check, 36 chars | Michelson runtime — used for signing operations |
| **EVM alias** | `0x…` hex, 42 chars | Tezos X EVM runtime — shown to dApps as `eth_accounts` |

The EVM alias is derived deterministically from your tz1 address via the Tezlink `tez_getTezosEthereumAddress` RPC call. It is not a separate key — it is a representation of the same underlying ed25519 key pair on the EVM runtime side.

## Password scope

The password you set during import is **specific to this device**. It protects the locally encrypted vault. It is not your Tezos wallet password (if you had one) and is not stored anywhere.

You can set a different password than the one you used on another device — only the seed phrase must match.

:::info Changing your password
v0.1.0 does not include a password-change flow. To change your password, use **Import an existing seed** again (export your seed phrase first from Settings if needed).
:::
