---
id: multi-account
title: Multi-account vaults
sidebar_label: Multi-account
---

# Multi-account vaults

Since **wallet 0.9.0** a single vault holds N accounts of any mix of kinds (Tezos and EVM). The hard cap is 50 (`MAX_ACCOUNTS_PER_VAULT`), the typical user has 1–3. From an unlocked vault you can add a new account, switch active, rename, and remove — all without re-entering the password except for destructive actions (Remove, Reveal Secret).

## Adding an account

From Home, tap the chevron next to the active account label (or the **+** affordance when you only have one account). The switcher's "Add account" row opens the four-step flow at `/accounts/add`:

1. **Kind** — Michelson (Tezos · BIP-39) or EVM (secp256k1 · 64-char hex).
2. **Source** — Create (the wallet generates a fresh secret) or Import (paste an existing one).
3. **Input** — for Create paths, the new mnemonic or private key appears blurred with a tap-to-reveal gate; for Import, a textarea (with a mnemonic/edsk toggle for Tezos imports). If the imported secret derives to an address already in the vault, a yellow warning surfaces ("This address already exists in your vault as `<label>` — adding it will create a duplicate") with a Continue-anyway checkbox. Duplicates are deliberately allowed since UUID v4 ids decouple identity from address.
4. **Confirm** — optional label (up to 32 characters) and a Confirm button that rounds through `ADD_ACCOUNT` then `SET_ACTIVE_ACCOUNT` and navigates back Home with the new account active.

Each new account gets its own seed or private key — they are independent. Single-mnemonic HD derivation (multiple accounts from one phrase) is deferred to a later release.

## Switching active

The active account is wallet-wide. Tapping a non-active row in the switcher fires `SET_ACTIVE_ACCOUNT`; the service worker rebuilds the active container and broadcasts an EIP-1193 `accountsChanged([<new 0x>])` event to every connected origin per the existing MetaMask-style contract. Connected dApps re-resolve who they're talking to. Switching is sub-50 ms after the first build for a given account thanks to the LRU container cache (default size 16).

## Pending approvals are pinned

When a dApp request lands in the approval queue, the wallet captures `keyring.getUnlocked().account.id` at enqueue time and stores it on the pending record. **The Approve popup always signs through that pinned account's container**, regardless of the wallet's current selector. The popup renders an `AccountChip` showing the pinned account; if the active selector now differs, a muted footnote reminds the user they don't need to switch back.

Removing an account that has a pending approval auto-rejects the request with EIP-1193 code `4001` next time the Approve popup queries it; the popup then renders a danger card and a Close-only action bar.

## Renaming and removing

Labels are pure UX strings — never used as identifiers. They can collide (two accounts can share the same label) and can be cleared (empty string). The canonical id is the UUID v4 chosen at creation; labels can change freely without breaking anything.

Removal requires the wallet password. If the user removes the active account, the keyring auto-switches to the next account in `createdAt` ASC order **before** the deletion, in a single atomic re-encrypt-and-save call. The last remaining account cannot be removed — the button is disabled in the modal.

## Reveal Secret is per-account

Settings → Reveal Secret opens an inline picker (read-only `AccountSwitcher` in pick mode) before the password gate when the vault holds ≥ 2 accounts. The picker lets you select which account's secret to reveal; the password input + reveal pane appears below. Single-account vaults skip the picker.

## Connections page filter

The dApp Connections page gains a top segmented control ("All accounts" / "This account") whenever the vault holds ≥ 2 accounts. Each session row carries an account meta line — the account's label or "Account N" fallback, with the truncated primary address. Sessions whose accountId no longer maps to a known account are flagged "Removed account" in danger colour. The filter selection persists in `chrome.storage.local` under `connectionsViewFilter` so it survives lock/unlock cycles.

## AccountId scheme (UUID v4)

Previous releases used the account's address as its id (`tz1…` or `0x…`). From 0.9.0 every account gets `crypto.randomUUID()` at creation time. This is a deliberate decoupling — labels are UX, addresses are crypto, and ids are stable handles independent of both. The wallet had no real users before 0.9.0 (previewnet phase only), so no migration was needed; vaults created on earlier versions do not carry forward.

## Vault format

Unchanged since 0.7.0. The encrypted plaintext is:

```typescript
type MultiAccountVaultPayload = {
  version:  2;
  accounts: Account[];
  active:   AccountId;
  secrets:  Record<AccountId, AccountSecret>;
};
```

What 0.9.0 changes is the `id` values inside `accounts[]` (UUIDs from 0.9.0; addresses before) and the fact that `accounts.length` is now allowed to grow beyond 1.

## Where the code lives

| Concern | File |
|---|---|
| Pure mutation helpers (addAccountToPayload, removeAccountFromPayload, setActiveOnPayload, renameOnPayload) | `packages/wallet/src/domain/vault.ts` |
| Keyring (crypto + persistence + unlock cache + 5 new methods + getSigningKeyFor) | `packages/wallet/src/background/keyring.ts` |
| Container LRU cache | `packages/wallet/src/composition/container-cache.ts` |
| Cache-aware container resolution + provider-listener attachment | `packages/wallet/src/composition/container-builder.ts` |
| Popup ↔ SW dispatch for ADD_ACCOUNT / REMOVE_ACCOUNT / SET_ACTIVE_ACCOUNT / RENAME_ACCOUNT / LIST_ACCOUNTS + accountsChanged broadcast | `packages/wallet/src/composition/sw-wiring.ts` |
| Pending-approval pinning (accountId captured at enqueue) | `packages/wallet/src/background/approval-queue.ts` + `composition/sw-wiring.ts` EthereumRequest handler |
| AccountHeader + AccountSwitcher + AccountChip + RenameModal + RemoveAccountModal | `packages/wallet/src/ui/tx/` |
| AddAccount route | `packages/wallet/src/ui/pages/AddAccount.tsx` |
| Settings Reveal Secret picker + Connections filter | `packages/wallet/src/ui/pages/Settings/` + `Connections.tsx` |
