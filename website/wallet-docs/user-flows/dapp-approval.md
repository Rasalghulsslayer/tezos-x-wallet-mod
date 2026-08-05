---
id: dapp-approval
title: dApp Approval
sidebar_label: dApp Approval
---

# dApp Approval

When a dApp requests your accounts or asks you to sign something, TezosX Wallet opens a dedicated **approval window** for your consent. No dApp action is taken until you explicitly approve.

## When approvals are triggered

Exactly three methods are gated behind an approval window (the list lives in the service worker's dispatch, `packages/core/src/composition/sw-wiring.ts`):

| dApp call | Approval type |
|---|---|
| `eth_requestAccounts` | Connection request |
| `eth_sendTransaction` | Transaction request |
| `personal_sign` | Signature request |

Everything else is handled without a popup:

- `eth_accounts` — never prompts; it returns the connected address for origins that hold a session, and `[]` for everyone else (the EIP-1193 contract).
- `eth_signTypedData` (any version) — **rejected with `-32601` before any prompt**: neither signer implements it, so the wallet refuses rather than asking you to approve a signature it cannot produce.
- Read-only methods (`eth_call`, `eth_getBalance`, `eth_blockNumber`, …) — proxied through without approval; they can't move funds.

Two more guards run before a popup ever opens:

- **Session gating** — `eth_sendTransaction` and `personal_sign` require an active session for the calling origin (the page must have completed `eth_requestAccounts` first). Calls from unconnected origins receive EIP-1193 error `4100` directly, with no popup.
- **Per-origin flood cap** — an origin may have at most 3 approval requests pending at once; further requests are rejected with `-32005` (limit exceeded) instead of opening yet another window.

## Connection request

A site calling `eth_requestAccounts` is asking for permission to know your EVM address.

The approval window shows:

- **Origin** — the requesting site
- **What it gets** — your EVM address (`0x…`); never your seed phrase or secret key
- **Approve / Reject** buttons

If you approve, the wallet:
1. Stores a `StoredSession` (origin, **accountId**, tz1Address, evmAlias, chainId, connectedAt) in `chrome.storage.local` — the session is bound to the account that approved it (see [Multi-account vaults](./multi-account))
2. Returns `[evmAlias]` to the dApp

If you reject, the dApp receives an EIP-1193 error `4001 — User rejected the request`.

## Transaction request

A site calling `eth_sendTransaction` is asking you to sign and broadcast a transaction.

The approval window shows two cards stacked vertically:

**dApp intent** — what the page asked for:

- **To** — destination address as the dApp specified
- **Value** — amount in wei
- **Data** — raw hex calldata (if any)
- **Method** — decoded method signature if resolvable (e.g. `transfer(address,uint256)`)

**What you actually sign** (present only for Tezos-source accounts) — the resolved Michelson call your `tz1` will commit to:

- **Michelson target** — the NAC gateway `KT1…` your op targets
- **Entrypoint** — `call` for bare value transfers (the generic HTTP `%call`), `call_evm` for ABI calls
- **Selector** — the 4-byte function selector, present only when the entrypoint is `call_evm`. Resolved against a curated local allow-list; **unknown selectors are rejected** (`-32602`, `UnknownSelectorError`) before the popup opens — there is no online lookup and no raw-hex fallback
- **Debit (mutez)** — the actual mutez amount that will move from your `tz1`. Wei amounts not divisible by 10¹² (1 mutez) are rejected upstream; what you see here is exact

The two cards let you verify the dApp's stated intent matches what the kernel will actually execute. EVM-source accounts skip the second card — they sign the EVM tx directly with no cross-runtime translation.

If you approve, the wallet signs through the **pinned account's container** — the account captured when the request was enqueued, regardless of what you switched to since — and returns the transaction hash to the dApp.

## Signature request

A site calling `personal_sign` opens a signature approval. The window shows the message decoded as text when it is plain UTF-8; if the payload contains bidirectional-override or zero-width characters (codepoints that can make the displayed text differ from what is signed), the wallet refuses to present it as text and shows the **raw hex** instead.

### Auto-recovery when the service worker session is lost

Manifest V3 evicts the wallet's service worker after a period of inactivity, or when it sits behind a long blocking call (e.g. a cross-runtime sign + resolve sequence). On wake, the SW has lost its in-memory unlock cache: `keyring.getUnlocked()` returns `null` and any popup operation other than `GET_STATE` / `UNLOCK` will respond with `4100` "Wallet is locked", even though the popup's React state may still think the user is unlocked.

The popup detects this case at the messaging layer ([`shared/messaging.ts`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/src/shared/messaging.ts), `SW_SESSION_LOST_EVENT`): on `4100` from any non-exempt request, a DOM event fires. The app's top-level `Gate` listens, re-runs `GET_STATE`, sees the SW-side state is now `locked`, and routes the user to `/unlock`. The user enters their password once and lands back at a working session — no need to lock + unlock manually.

This is purely a UX improvement; the security model is unchanged (the keyring is genuinely re-derived from the password on every SW boot).

## Approval window lifecycle

```mermaid
sequenceDiagram
    participant dApp
    participant SW as Service Worker
    participant AW as Approve Window

    dApp->>SW: eth_requestAccounts / eth_sendTransaction / personal_sign
    SW->>AW: chrome.windows.create (420 × 620 popup)
    AW->>SW: GET_PENDING (fetch request details)
    SW-->>AW: PendingRequest
    AW->>AW: User reads and decides
    AW->>SW: RESOLVE_PENDING { decision }
    SW->>AW: close window
    SW-->>dApp: result or 4001 error
```

The approval window is a separate Chrome popup (not the extension popup). It has its own URL (`approve.html?requestId=…`) and is closed automatically after the decision.

## Toolbar badge — pending request counter

The toolbar icon displays a badge with the **count of pending approvals** so you don't miss one if you switched tabs:

- Each newly gated request bumps the badge to `1` (or `N` if several queue up).
- The badge is cleared as soon as you approve, reject, or close an approval window.
- The badge is also cleared on lock and on service-worker restart, so a stale "1" can never outlive the actual queue.

Implementation lives in `packages/wallet/src/adapters/chrome/chrome-notification.ts` (`ChromeNotificationPort.setPendingCount`), driven by the approval queue in `packages/core/src/background/approval-queue.ts`; the colour (mirroring `var(--tx-purple)`) is centralised in `BADGE_BG_COLOR` so the badge stays visually consistent with the rest of the wallet design.

## What if I close the window?

Closing the approval window with the Chrome × button is treated as an explicit **reject**. The wallet listens to `chrome.windows.onRemoved` and resolves the pending request with `4001 — User rejected the request`, so the dApp's promise never hangs and the badge decrements correctly.

:::caution Pending requests on lock
Locking the wallet also rejects every pending approval (`rejectAll()`); each waiting dApp receives `4001 — User rejected the request`.
:::

## See also

- [Manage Connections](./manage-connections) — reviewing and revoking the sessions approvals create
- [Multi-account vaults](./multi-account) — how approvals pin the signing account
