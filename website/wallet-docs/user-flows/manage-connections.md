---
id: manage-connections
title: Manage Connections
sidebar_label: Manage Connections
---

# Manage Connections

The Connections page lists every dApp site that has been granted access to your wallet, and lets you revoke access per site.

## Viewing connected sites

Open **Settings → Connected sites** (the Settings tab sits in the bottom nav bar). Each entry shows:

- **Hostname** — the origin of the connected site (e.g. `app.example.com`)
- **Connected** — relative timestamp (e.g. "3 hours ago", "2 days ago")
- **Account** — which account the session is bound to: the account's label (or "Account N" fallback) with its truncated primary address

If no dApps are connected, the page shows an empty state message.

### Account filter

When the vault holds two or more accounts, a segmented control at the top filters the list: **All accounts** / **This account**. The selection persists in `chrome.storage.local` under `connectionsViewFilter`, so it survives lock/unlock cycles.

Sessions whose `accountId` no longer maps to a known account (the account was removed) are flagged **"Removed account"** in danger colour; sessions written before accounts carried ids are flagged "Legacy session". See [Multi-account vaults](./multi-account) for the account model.

## What a session contains

Each connection is stored as a `StoredSession` in `chrome.storage.local`:

```ts
interface StoredSession {
  origin:      string;   // e.g. "https://app.example.com"
  accountId?:  string;   // UUID of the account that approved the connection
  tz1Address:  string;   // tz1 at connection time (empty for EVM-native accounts)
  evmAlias:    string;   // the 0x address shown to the dApp
  chainId:     string;   // hex chain ID, e.g. "0x1f440"
  connectedAt: number;   // Unix timestamp (ms)
}
```

Sessions survive service worker restarts and browser restarts (stored in `chrome.storage.local`). Each origin stays bound to the account it connected with: switching the wallet's active account does **not** re-point existing sessions.

## Disconnecting a site

Click **Disconnect** next to a site. This:

1. Removes the `StoredSession` from `chrome.storage.local`
2. Does **not** actively notify the dApp page

The dApp will lose access on its next `eth_accounts` call (returns `[]`) or when it calls `eth_requestAccounts` again and receives the approval popup.

:::tip dApp-initiated disconnect
For Tezos-source accounts, the provider accepts `wallet_revokePermissions` and `wallet_disconnect`: it clears its in-memory session state and emits `accountsChanged([])`. The wallet's stored session entry is not removed by these calls, though — this page's **Disconnect** button is the definitive revocation.
:::

## Provider events on account removal

When you remove an account that has connected sessions, the service worker drops those sessions and notifies **only the affected origins** with an `accountsChanged` event carrying an empty array:

```ts
provider.on('accountsChanged', (accounts) => {
  if (accounts.length === 0) {
    // dApp knows this wallet account is gone
  }
});
```

Sessions bound to other accounts are untouched — an account operation never discloses or re-points another origin's account. The broadcast uses `chrome.tabs.query` to find all tabs at the affected origin and sends a `PROVIDER_EVENT` message to each via `chrome.tabs.sendMessage`.

## See also

- [dApp Approval](./dapp-approval) — the flow that creates these sessions
- [Multi-account vaults](./multi-account) — per-account session binding and the account filter
- [Settings](./settings) — where the Connected sites entry lives
