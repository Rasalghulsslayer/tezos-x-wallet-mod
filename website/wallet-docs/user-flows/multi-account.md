---
id: multi-account
title: Multi-account vaults
sidebar_label: Multi-account
---

# Multi-account vaults

Since **wallet 0.9.0** a single vault holds N accounts of any mix of kinds (Tezos and EVM). The hard cap is 50 (`MAX_ACCOUNTS_PER_VAULT`), the typical user has 1–3. From an unlocked vault you can add a new account, switch active, rename, and remove — all without re-entering the password except for destructive actions (Remove, Reveal secret).

## Adding an account

From Home, tap the chevron next to the active account label (or the **+** affordance when you only have one account). The switcher's "Add account" row opens the three-step flow at `/accounts/add` (also reachable from **Settings → Add account**): **pick → input → confirm**.

When the vault holds a **wallet seed** (a vault created or imported from a recovery phrase), the picker leads with two derived cards:

- **Tezos account — "Next account from your seed phrase. No new backup needed."**
- **EVM account — "Next EVM account from your seed phrase. No new backup needed."**

Choosing one derives the next unused per-curve HD index from the existing phrase — `m/44'/1729'/i'/0'` for Tezos, `m/44'/60'/0'/0/i` for EVM — so there is **nothing new to back up**. Indices left by removed accounts are never reused (`nextDerivationIndex` always picks one past the highest ever used), so a removed account's address is never silently resurrected. Derived picks skip the input step entirely — the seed never leaves the service worker, so there's no secret to reveal — and jump straight to naming/confirm.

Fresh and import remain available as advanced options on the same picker:

- **Fresh** — the wallet generates a new separate BIP-39 mnemonic (Tezos) or a new 256-bit private key (EVM). The secret appears blurred with a tap-to-reveal gate and acknowledgement checkboxes; it is *not* covered by your wallet seed phrase, so it needs its own backup.
- **Import** — paste a recovery phrase or `edsk…` key (Tezos), or a `0x`/raw-hex private key (EVM). If the pasted secret derives to an address already in the vault, a duplicate warning surfaces with a shortcut to **switch to the existing account** instead; the keyring refuses to store the same address twice (`DuplicateAccountError`).

The confirm step takes an optional label (up to 32 characters) and rounds through `ADD_ACCOUNT` then `SET_ACTIVE_ACCOUNT`, navigating back Home with the new account active.

Old vaults migrate transparently: a vault written by an earlier release is upgraded to the current payload version on unlock (see [Keyring](../architecture/keyring)). Migration never invents a wallet seed, though — the provenance of a pre-existing account's mnemonic is unknowable, so the seed is only ever written by onboarding. On a migrated vault the derived cards stay hidden until a phrase-backed vault exists.

## Switching active

The active account is wallet-wide for the wallet's own UI (Home, Send, Activity). Tapping a non-active row in the switcher fires `SET_ACTIVE_ACCOUNT`; the service worker rebuilds the active container. Switching is sub-50 ms after the first build for a given account thanks to the LRU container cache (default size 16).

Switching does **not** change what any connected dApp sees: each origin stays bound to the account it connected with (`StoredSession.accountId`), and no `accountsChanged` event is broadcast on a switch. A dApp only changes accounts by reconnecting.

## Pending approvals are pinned

When a dApp request lands in the approval queue, the wallet captures `keyring.getUnlocked().account.id` at enqueue time and stores it on the pending record. **The Approve popup always signs through that pinned account's container**, regardless of the wallet's current selector. The popup renders an `AccountChip` showing the pinned account; if the active selector now differs, a muted footnote reminds the user they don't need to switch back.

Removing an account that has a pending approval rejects the request with EIP-1193 code `4001` ("The signing account was removed before approval"); the Approve popup renders a danger card and a Close-only action bar.

## Renaming and removing

Labels are pure UX strings — never used as identifiers. They can collide (two accounts can share the same label) and can be cleared (empty string). The canonical id is the UUID v4 chosen at creation; labels can change freely without breaking anything.

Removal requires the wallet password. If the user removes the active account, the vault auto-switches to the oldest remaining account (`createdAt` ascending) in the same atomic re-encrypt-and-save. The last remaining account cannot be removed — the button is disabled in the modal. Removing an account also drops any dApp sessions bound to it and notifies those origins with `accountsChanged([])` (see [Manage Connections](./manage-connections)).

## Reveal secret is per-account

**Settings → Reveal secret** opens an inline account picker before the password gate when the vault holds ≥ 2 accounts. The picker lets you select which account's secret to reveal; the password input + reveal pane appears below. Single-account vaults skip the picker. For a derived account, the revealed secret is the concrete signing material (`edsk…` or EVM private key) resolved from the seed at that account's index.

## Reveal seed phrase

When the vault holds a wallet seed, Settings gains a second, password-gated **Reveal seed phrase** row — "the wallet-level phrase your derived accounts hang off". The vault is re-decrypted with the password you type; the seed is never cached in the UI. Vaults without a seed (created from an `edsk…` or EVM key import) don't show the row.

## Connections page filter

The dApp Connections page gains a top segmented control ("All accounts" / "This account") whenever the vault holds ≥ 2 accounts. Each session row carries an account meta line — the account's label or "Account N" fallback, with the truncated primary address. Sessions whose accountId no longer maps to a known account are flagged "Removed account" in danger colour. The filter selection persists in `chrome.storage.local` under `connectionsViewFilter` so it survives lock/unlock cycles.

## AccountId scheme (UUID v4)

Previous releases used the account's address as its id (`tz1…` or `0x…`). From 0.9.0 every account gets `crypto.randomUUID()` at creation time. This is a deliberate decoupling — labels are UX, addresses are crypto, and ids are stable handles independent of both.

## Vault format

The encrypted plaintext is a version-3 payload:

```typescript
type MultiAccountVaultPayload = {
  version:  3;
  seed?:    { mnemonic: string };   // wallet-level seed; present only when
                                    // onboarding created/imported a phrase
  accounts: Account[];
  active:   AccountId;
  secrets:  Record<AccountId, AccountSecret>;
};
```

Per-account secrets are discriminated: `{ kind: 'derived', index }` for seed-derived accounts, `{ kind: 'mnemonic' | 'edsk' | 'evm-pk', value }` for standalone ones. Version-2 vaults are upgraded to version 3 on read (no seed is added); the upgraded payload reaches disk on the next mutation.

## Where the code lives

| Concern | File |
|---|---|
| Pure mutation helpers (addAccountToPayload, removeAccountFromPayload, setActiveOnPayload, renameOnPayload, nextDerivationIndex) | `packages/core/src/domain/vault.ts` |
| Keyring (crypto + persistence + unlock cache + account mutations + getSigningKeyFor + exportWalletSeed) | `packages/core/src/background/keyring.ts` |
| HD derivation (Tezos + EVM) | `packages/core/src/shared/seed.ts`, `packages/core/src/shared/evm-signing/derive-evm-from-mnemonic.ts` |
| Container LRU cache | `packages/core/src/composition/container-cache.ts` |
| Cache-aware container resolution + provider-listener attachment | `packages/core/src/composition/container-builder.ts` |
| Popup ↔ SW dispatch for ADD_ACCOUNT / REMOVE_ACCOUNT / SET_ACTIVE_ACCOUNT / RENAME_ACCOUNT / LIST_ACCOUNTS | `packages/core/src/composition/sw-wiring.ts` |
| Pending-approval pinning (accountId captured at enqueue) | `packages/core/src/background/approval-queue.ts` + `sw-wiring.ts` EthereumRequest handler |
| AccountHeader + AccountSwitcher + AccountChip + RenameModal + RemoveAccountModal | `packages/wallet/src/ui/tx/` |
| AddAccount route (pick / input / confirm steps) | `packages/wallet/src/ui/pages/AddAccount/` |
| Settings Reveal secret picker + Reveal seed phrase | `packages/wallet/src/ui/pages/Settings/` |
| Connections filter | `packages/wallet/src/ui/pages/Connections.tsx` |

## See also

- [Settings](./settings) — Reveal secret, Reveal seed phrase, Add account entry points
- [dApp Approval](./dapp-approval) — how approvals pin the signing account
- [Manage Connections](./manage-connections) — per-account sessions and the account filter
