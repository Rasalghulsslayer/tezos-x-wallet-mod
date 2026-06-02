---
id: security-model
title: Security Model
sidebar_label: Security Model
---

# Security Model

TezosX Wallet is **testnet software** — do not use it to manage mainnet funds. This page documents the security properties it provides and the assumptions it makes.

## Key storage

| Data | Location | Cleared on |
|---|---|---|
| Encrypted vault (mnemonic) | `chrome.storage.local` | Manual reset / reinstall |
| Derived keys (tz1, sk, pk) | Service worker memory only | Lock, SW restart, browser close |
| Password | Never stored | N/A |

The secret key (`edsk…`) exists in memory only while the wallet is **unlocked**. Calling `lock()` or allowing the service worker to restart clears it immediately. There is no way to extract the key from a locked wallet without the password.

## Vault encryption

```
password ──PBKDF2-SHA256(200 000 iters)──► derivedKey (256-bit)
mnemonic ──AES-256-GCM──► ciphertext
```

- **PBKDF2 with 200 000 SHA-256 iterations** makes a dictionary attack expensive on commodity hardware (≈ seconds per guess rather than microseconds)
- **AES-256-GCM** provides authenticated encryption — tampering with the ciphertext is detectable
- A fresh **random 256-bit salt** and **96-bit IV** are generated on every vault write

## Origin spoofing prevention

The injected provider rejects messages not originating from the same window:

```ts
window.addEventListener('message', (event) => {
  if (event.source !== window) return;   // drop cross-frame messages
  ...
});
```

Request envelopes include the `origin` captured by the content bridge (`window.location.origin`), not a value supplied by the page. This prevents a malicious page from claiming a different origin to access sessions belonging to another site.

## Approval gate

Every `eth_requestAccounts` and `eth_sendTransaction` call blocks on an explicit user decision in the approval popup. The service worker never forwards these requests to the provider without a confirmed `'approve'` decision.

## What "lock" resets

Calling `lock()` or having the service worker restart resets the following:

- `UnlockedIdentity` (tz1, publicKey, secretKey) — cleared
- `RelayerProvider` instance — set to `null`
- `evmAlias` cache — set to `null`
- `ApprovalQueue` — all pending requests rejected with `4001`

The encrypted vault in `chrome.storage.local` and all `StoredSession` records are **not** affected by lock.

## Threat model

| Threat | Mitigated? | Notes |
|---|---|---|
| Password brute-force on stolen vault | Partially | PBKDF2 slows attacks; strong password recommended |
| Memory scraping while unlocked | No | Key is in SW memory; Chrome process isolation is the only barrier |
| Malicious web page accessing `window.ethereum` | Yes | Approval popup required for all sensitive methods |
| Cross-origin message injection | Yes | `event.source !== window` check |
| dApp claiming wrong origin | Yes | Origin captured by content bridge, not page-supplied |
| Extension code tampering | Out of scope | Requires malicious extension or compromised build |

## Testnet disclaimer

This wallet targets the **Tezos X Previewnet** exclusively. The UI shows a persistent testnet badge. RPC endpoints, contract addresses, and chain IDs are hardcoded to Previewnet values in `packages/wallet/src/lib/constants.ts`. Do not attempt to use this wallet on any production network.
