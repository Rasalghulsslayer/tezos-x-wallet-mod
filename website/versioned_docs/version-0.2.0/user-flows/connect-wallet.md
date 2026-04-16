---
id: connect-wallet
title: Connect Wallet
sidebar_position: 1
---

# Connect Wallet Flow

:::warning Temple mobile only
The Beacon connection currently works with **Temple mobile** (QR code scan) only. The Temple browser extension is **not yet supported** — the connection flow via the extension is still under development.
:::

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant dApp
    participant Relayer as Relayer (window.ethereum)
    participant Beacon
    participant Temple

    dApp->>Relayer: eth_requestAccounts
    Relayer->>Beacon: requestPermissions()
    Beacon->>Temple: Open wallet picker
    Temple->>User: "Allow connection?"
    User->>Temple: Confirm
    Temple->>Beacon: { address: tz1..., publicKey }
    Beacon->>Relayer: permissions granted
    Relayer->>Relayer: tez_getEthereumTezosAddress(tz1)
    Note over Relayer: Derives 0xAlias from tz1
    Relayer->>dApp: ['0xAlias...']
    Note over dApp: Shows connected account
```

## Console commands

```js
// Connect
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
console.log(accounts); // ['0x341af4de...']

// Disconnect
await window.ethereum.request({ method: 'wallet_revokePermissions' });

// Clear Beacon session (if modal doesn't open)
Object.keys(localStorage)
  .filter(k => k.startsWith('beacon'))
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

## Notes

- **Temple mobile** — scan the QR code with the Temple mobile app to connect
- **Temple extension** — not yet supported; the extension flow is in development
- If the Beacon modal doesn't open, clear the Beacon localStorage session using the console command above and reload the page
