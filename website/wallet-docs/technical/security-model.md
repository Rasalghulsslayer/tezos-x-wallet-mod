---
id: security-model
title: Security Model
sidebar_label: Security Model
---

# Security Model

TezosX Wallet is **testnet software** — do not use it to manage mainnet funds. This page documents the security properties the current release provides and the assumptions it makes.

## What is stored where

| Data | Location | Cleared on |
|---|---|---|
| Encrypted vault (all account secrets + optional wallet seed) | `chrome.storage.local` | Manual reset / reinstall |
| Decrypted vault payload + derived vault key (`km`) | Service worker memory only | Lock, auto-lock, SW death, browser close |
| Per-origin dApp sessions (`StoredSession`) | `chrome.storage.local` | Disconnect, account removal |
| Unlock-throttle state | `chrome.storage.local` | Successful unlock |
| Wallet-activity timestamp (auto-lock) | `chrome.storage.session` | Browser close |
| Password | Never stored | — |

### Vault encryption

```
password ──PBKDF2-HMAC-SHA256 (600 000 iterations)──► vault key (256-bit)
payload  ──AES-256-GCM──► ciphertext
```

- **PBKDF2 with 600,000 SHA-256 iterations** (the OWASP-recommended floor). The vault ciphertext sits in plaintext-readable storage on disk, so this work factor is the only cost an offline brute-force has to pay per guess.
- **AES-256-GCM** provides authenticated encryption — tampering with the ciphertext is detectable.
- A fresh **random 16-byte salt** is generated whenever a key is derived (vault creation, work-factor upgrade); every write uses a fresh **random 12-byte IV**, as GCM requires. Re-seals with the retained key pin the salt.
- **Per-vault work-factor upgrade**: the vault envelope records its own iteration count. A vault created at a lower count still unlocks, and is transparently re-encrypted at 600,000 iterations during that unlock — the one moment the password is still in scope.

## What stays in memory while unlocked

While unlocked, the keyring retains exactly two things: the **decrypted vault payload** (mutations — add / remove / rename / switch account — edit and re-seal it without re-prompting for the password) and **`km`**, the PBKDF2-derived vault key together with the salt and work factor it was derived at.

It retains **neither of the following**:

- **The password.** Flows that must prove the user knows it (account removal) derive a candidate key at the retained salt and work factor and compare it to `km` **in constant time**; reveal/export flows re-prompt and decrypt the vault from disk.
- **Per-account signing keys.** The container builder derives a signing key on demand via `getSigningKeyFor` when it wires the adapters for an account; nothing signing-capable lingers between uses.

On lock, `km`'s raw key bytes are zeroized (overwritten in place). Two honest limits remain: the payload's secrets are JavaScript strings, which cannot be overwritten — on lock their guarantee is unreachability, then garbage collection; and in-flight operations keep references to what they need until they settle.

## Unlock throttle

The first 5 failed unlock attempts carry no penalty. Past that, an exponential lockout arms: 5 seconds, doubling per further failure, capped at 5 minutes. While a lockout window is active, unlock refuses before even deriving a key. The state is persisted in `chrome.storage.local`, so restarting the service worker (or the browser) does not reset it — an attacker with the device cannot grind the vault by restarting the process. It is cleared on a successful unlock.

## Auto-lock

**Extension:**

- **Wallet-inactivity deadline.** Every trusted-UI message (popup, side panel, approval window) stamps an activity timestamp; a periodic alarm (1-minute granularity, the `chrome.alarms` floor) locks once **5 minutes** pass without one. dApp traffic deliberately does *not* count as activity — a polling page must not hold the wallet open forever. An unlocked wallet with no stamp fails closed and locks.
- **Immediate lock** on system idle or screen lock (`chrome.idle`) and on service-worker suspend.
- **Service-worker death is itself a lock**: the unlocked state is memory-only, so when Chrome evicts the idle MV3 worker the wallet is locked. There is no fixed eviction number — the timing varies with browser version and activity.
- Locking, however triggered, also **rejects every pending dApp approval**.

**Mobile:** immediate lock when the app is backgrounded, plus the same 5-minute foreground inactivity timer, reset on user interaction.

## dApp and approval hardening

### Origin integrity

- Both the injected provider and the content bridge drop cross-frame messages (`event.source !== window` on each side of the `postMessage` channel).
- The request origin is stamped by the content bridge from `window.location.origin` — never taken from the page. The service worker additionally rejects any envelope whose stamped origin disagrees with the host-verified sender, and rejects dApp requests that arrive over anything but the dApp channel, so a page cannot claim another site's origin or impersonate the trusted UI.

### Approval gate

- `eth_requestAccounts`, `eth_sendTransaction`, and signature requests block on an explicit user decision in the approval window. Signing methods without an approved session for the calling origin are rejected with EIP-1193 code `4100`; `eth_accounts` returns `[]` for origins that never connected.
- **Per-origin pending cap**: one origin may have at most **3** requests awaiting approval; further ones are rejected with `-32005`. This blocks approval flooding — an unbounded stack of popups is both a desktop DoS and an approval-fatigue attack inviting an accidental confirm.
- **Request-id authority**: the service worker only accepts approval decisions (`RESOLVE_PENDING`) for a request id it knows is pending — unknown ids return `-32602` — and a duplicate id can never replace what the approval UI is showing. Closing the approval window counts as a rejection.
- **Full-origin display**: an `https` origin renders as its clean `host[:port]`; anything else renders the full `scheme://host[:port]` and is visibly flagged as insecure — `http://victim.com` can no longer look identical to `https://victim.com`.
- **Deceptive-text rejection**: a signing payload containing bidi overrides, embeddings, isolates, or zero-width characters is never rendered as text — the preview falls back to raw hex, so what the user reads is what is signed.
- **Recipient checksum (EIP-55)**: a mixed-case `0x` address with a broken checksum is treated as a typo and rejected, not silently accepted.

### Approval-window isolation (defence in depth)

Three independent layers keep the approval UI un-frameable:

1. `web_accessible_resources` is kept **empty** — the postbuild script strips the entries the build plugin injects, and the E2E suite fails if an HTML page ever leaks back in.
2. The manifest CSP declares `frame-ancestors 'none'` for all extension pages.
3. The approval page itself refuses to render inside a frame (`window.top !== window` runtime guard).

The window is opened by the service worker via `chrome.windows.create`, which needs none of the above.

## Clipboard auto-clear

Copying a revealed secret (mnemonic, private key, or wallet seed) schedules the clipboard to be cleared after **30 seconds** — and only if it still holds that exact value, so anything the user copied since is never clobbered. A revealed secret does not sit indefinitely in the OS clipboard, readable by any app and synced across devices.

## Threat model

| Threat | Mitigated? | Notes |
|---|---|---|
| Password brute-force on a stolen vault | Partially | 600k PBKDF2 iterations per guess; a strong password is still required |
| Password brute-force through the UI | Yes | Persistent exponential lockout after 5 failures |
| Memory scraping while unlocked | No | Payload + vault key live in SW memory; Chrome process isolation is the only barrier |
| Secrets lingering after lock | Partially | Vault key zeroized; JS-string secrets are unreachable then garbage-collected, not overwritten |
| Wallet left unlocked unattended | Yes | 5-min inactivity auto-lock, immediate lock on idle / screen lock / SW suspend (extension) and on backgrounding (mobile) |
| Malicious page calling `window.ethereum` | Yes | Approval gate + per-origin sessions (`4100` without one) |
| Approval flooding / fatigue | Yes | Per-origin cap of 3 pending requests (`-32005`) |
| Clickjacking the approval window | Yes | Empty `web_accessible_resources` + `frame-ancestors 'none'` + runtime iframe guard |
| Origin spoofing (cross-frame or claimed origin) | Yes | `event.source` checks; origin stamped by the bridge and cross-checked against the verified sender |
| Deceptive signature payloads | Yes | Bidi / zero-width text refused; raw hex shown instead |
| Typo'd or tampered recipient address | Partially | EIP-55 checksum enforced on mixed-case addresses; an all-lowercase address carries no checksum to verify |
| Secrets lingering on the clipboard | Yes | 30 s auto-clear on secret reveals |
| Extension code tampering | Out of scope | Requires a malicious extension or a compromised build |

## Verified by tests

The properties above are backed by over 300 unit tests across the workspace packages — covering the keyring retention contract, the vault crypto (including cross-implementation byte-compatibility between the extension's Web Crypto and the mobile crypto port), the unlock throttle, the auto-lock predicates, and the approval queue — plus a 12-spec Playwright end-to-end suite that loads the built extension into a real Chromium and exercises the approval flows and security guards (invalid request id, iframe clickjacking guard, unsupported signing methods) with **all network calls mocked**. Both suites run as blocking gates in CI.

## Testnet disclaimer

This wallet targets the **Tezos X Previewnet** exclusively. The UI shows a persistent experimental-software banner. RPC endpoints, contract addresses, and chain IDs are hardcoded to Previewnet values in `packages/relayer/src/shared/constants.ts` (kernel endpoints, gateway addresses) and `packages/core/src/shared/constants.ts` (wallet-level endpoints). Do not attempt to use this wallet on any production network.
