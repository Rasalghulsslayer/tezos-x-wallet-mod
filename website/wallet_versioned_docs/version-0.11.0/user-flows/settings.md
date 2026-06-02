---
id: settings
title: Settings
sidebar_label: Settings
---

# Settings

The Settings page is accessible from the gear icon in the Header. It provides security controls, block explorer links, and version information.

## Security

### Reveal recovery phrase

Click **Reveal recovery phrase** and enter your password to display your 24-word seed phrase.

- The words are shown blurred by default; click the eye icon to toggle visibility
- The password is re-verified against the encrypted vault each time — the seed is never cached in the UI
- Close the dialog to dismiss

:::danger Keep your seed phrase private
Do not take screenshots or share your seed phrase. Anyone with these 24 words has full, irrecoverable access to your funds.
:::

### Lock wallet

Click **Lock** to immediately:

1. Clear the `UnlockedIdentity` from service worker memory
2. Set `provider = null` (rejects any subsequent dApp requests with `4100 — Unauthorized`)
3. Reject all pending approval requests with `4001 — User rejected the request`
4. Redirect the popup to the Unlock screen

The encrypted vault on disk is unaffected — you can unlock again with your password.

## Explorers

Two deep-link rows let you open your addresses in external block explorers:

| Explorer | Address used | What it shows |
|---|---|---|
| **Blockscout** (EVM) | EVM alias (`0x…`) | EVM runtime transactions, token balances |
| **tzkt** (Michelson runtime) | tz1 address | Michelson runtime operations, delegation, balance |

Both links open in a new browser tab.

## About

The About section shows:

| Field | Value |
|---|---|
| Wallet version | `0.1.0` |
| Relayer version | `0.3.0` |
| Network | Tezos X Previewnet |

These are hardcoded in `packages/wallet/src/lib/constants.ts` and updated with each release.
