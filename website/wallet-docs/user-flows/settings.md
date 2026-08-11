---
id: settings
title: Settings
sidebar_label: Settings
---

# Settings

The Settings page is reachable from the gear icon in the Home top bar and from the Settings tab in the bottom nav. It shows the active account card, wallet management rows, security controls, block explorer links, and version information.

## Wallet

| Row | What it does |
|---|---|
| **Connected sites** | Opens the [Connections](./manage-connections) page listing per-origin dApp sessions |
| **Add account** | Opens the [Add account](./multi-account) flow (create, derive, or import another account) |
| **Manage tokens** | Add or remove [custom ERC-20 tokens](./custom-tokens) for the active account |
| **Contacts** | Opens the [Contacts](./contacts) address book — name the addresses you send to |

## Explorers

Deep-link rows open your addresses in external block explorers, adapted to the active account's kind:

| Explorer | Address used | What it shows |
|---|---|---|
| **Blockscout (EVM)** | The account's `0x` address (its EVM alias for Tezos accounts) | EVM runtime transactions, token balances |
| **tzkt (Michelson runtime)** — Tezos accounts only | tz1 address | Michelson runtime operations, delegation, balance |

Both links open in a new browser tab.

## Security

### Reveal secret

Click **Reveal secret** and enter your password to display the active account's secret — a recovery phrase or `edsk…` key for Tezos accounts, a private key for EVM accounts. When the vault holds two or more accounts, an account picker appears first so you choose whose secret to reveal. For an account derived from the wallet seed, the revealed secret is the concrete signing key at that account's index.

- The secret is shown blurred by default; toggle visibility with the eye icon
- The password is re-verified against the encrypted vault each time — the secret is never cached in the UI
- Close the dialog to dismiss

### Reveal seed phrase

When the vault holds a wallet-level seed (created or imported from a recovery phrase), a second row — **Reveal seed phrase** — reveals the phrase your derived accounts hang off, behind the same password gate. Vaults built from a standalone `edsk…` or EVM key import don't show this row. See [Multi-account vaults](./multi-account).

:::danger Keep your secrets private
Do not take screenshots or share your seed phrase or private keys. Anyone with them has full, irrecoverable access to your funds. Remember that separately imported keys are not covered by the wallet seed phrase — each needs its own backup.
:::

### Change password

**Change password** re-seals the encrypted vault under a new password. Your secrets and addresses are unchanged — only the key that opens the vault on this device. The form asks for the current password, the new one (same 8-character minimum as onboarding), and a confirmation:

- The current password is re-verified against the vault key **in constant time**, the same check account removal runs — it is never stored
- The vault is re-encrypted with the standard envelope at a fresh random salt; the wallet **stays unlocked** afterwards
- The password fields are scrubbed on every exit path (success or cancel); on a failed attempt, only the field you have to retype is cleared
- On mobile, the biometric unlock secret sealed in the OS keystore is re-sealed with the new password in the same operation — see [Mobile Security](../mobile/security)

Details in [Password lifecycle](../technical/security-model#password-lifecycle).

### Lock wallet

Click **Lock wallet** to immediately:

1. Wipe the keyring's in-memory state (the derived vault key is zeroized; no password or signing key is retained in the first place)
2. Drop the account containers (subsequent dApp or popup requests get `4100 — Unauthorized`)
3. Reject all pending approval requests with `4001 — User rejected the request`
4. Redirect the popup to the Unlock screen

The encrypted vault on disk is unaffected — you can unlock again with your password.

:::info Auto-lock
The wallet also locks itself without your help: after **5 minutes** without wallet activity, when the system goes idle or the screen locks, and when the browser suspends the extension's service worker. Details in the [Security model](../technical/security-model).
:::

## Side panel

From the Home top bar, the **Open in side panel** button docks the wallet as a Chrome side panel — the same UI, filling the panel's height, that stays open while you browse. Useful when interacting with a dApp and the wallet at the same time.

## About

The About section shows:

| Field | Value |
|---|---|
| Version | `Wallet vX.Y.Z · Core vX.Y.Z` — the extension and `@tezosx/wallet-core` versions, injected at build time from each package's `package.json` |
| Network | Tezos X Previewnet |

The version strings are build-time defines (`__WALLET_VERSION__` / `__CORE_VERSION__`), so they always match the installed release — there is nothing to hand-edit.

## See also

- [Security model](../technical/security-model) — vault encryption, auto-lock, unlock throttle, password lifecycle
- [Multi-account vaults](./multi-account) — Add account, Reveal secret per account, Reveal seed phrase
- [Contacts](./contacts) — the wallet-global address book behind the Contacts row
- [Manage Connections](./manage-connections) — the page behind Connected sites
