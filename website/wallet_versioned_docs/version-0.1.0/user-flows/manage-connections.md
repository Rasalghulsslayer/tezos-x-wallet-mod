---
id: manage-connections
title: Manage Connections
sidebar_label: Manage Connections
---

# Manage Connections

The Connections page lists every dApp site that has been granted access to your wallet, and lets you revoke access per site.

## Viewing connected sites

Navigate to the Connections tab (middle icon in the bottom nav bar). Each entry shows:

- **Hostname** — the origin of the connected site (e.g. `app.example.com`)
- **Connected** — relative timestamp (e.g. "3 hours ago", "2 days ago")

If no dApps are connected, the page shows an empty state message.

## What a session contains

Each connection is stored as a `StoredSession` in `chrome.storage.local`:

```ts
interface StoredSession {
  origin:      string;   // e.g. "https://app.example.com"
  tz1Address:  string;   // your tz1 address at connection time
  evmAlias:    string;   // your EVM alias shown to the dApp
  chainId:     string;   // hex chain ID, e.g. "0x1f094"
  connectedAt: number;   // Unix timestamp (ms)
}
```

Sessions survive service worker restarts and browser restarts (stored in `chrome.storage.local`).

## Disconnecting a site

Click **Disconnect** next to a site. This:

1. Removes the `StoredSession` from `chrome.storage.local`
2. Does **not** actively notify the dApp page

The dApp will lose access on its next `eth_accounts` call (returns `[]`) or when it calls `eth_requestAccounts` again and receives the approval popup.

:::tip Proactive disconnect from the dApp
If a dApp supports `wallet_revokePermissions` or `wallet_disconnect`, it can also disconnect programmatically. The wallet handles both methods and removes the session.
:::

## Provider events on account change

If the wallet is locked while a dApp is open, the service worker broadcasts an `accountsChanged` event with an empty array to all tabs matching a stored session's origin:

```ts
provider.on('accountsChanged', (accounts) => {
  if (accounts.length === 0) {
    // dApp knows the wallet disconnected
  }
});
```

The broadcast uses `chrome.tabs.query` to find all tabs at the connected origin and sends a `PROVIDER_EVENT` message to each via `chrome.tabs.sendMessage`.
