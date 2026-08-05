---
id: activity-tab
title: Activity tab
sidebar_label: Activity
---

# Activity tab

Since **wallet 0.8.0** the Activity tab is functional. It shows a merged feed of historical transactions across both Tezos X runtimes — Michelson-runtime ops from TzKT and EVM-runtime transactions from Blockscout — auto-refreshed every 30 seconds with a Twitter-style "N new" pill so the list doesn't move under you while you're reading.

Every row is classified three ways: **Michelson** (native tz1 ops), **EVM** (native EVM-runtime txs), or **Cross-runtime** (one transfer that spans both — see the dedup below).

## What's in the feed

For a **Michelson (`tz1`) account**: both sides are queried. Native tz1 transfers, NAC gateway calls (cross-runtime sends through `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`), and any Michelson contract call land here, alongside EVM-side rows for any cross-runtime op the kernel has mirrored to the user's derived EVM alias. Registered ERC-20 Transfer events are decoded too (see [Custom tokens](./custom-tokens)).

For an **EVM-native (`0x`) account**: only the EVM side is meaningful. Native EVM-runtime transfers, NAC precompile calls to `0xff…007` (cross-runtime back to a tz1), and generic EVM contract calls.

## Cross-runtime transfers are one row

A single `tz1 → 0x` send produces **two records** on the explorers — one Michelson op on TzKT, one kernel-synthesized EVM tx on Blockscout (with a deterministic hash derived from the Michelson op hash). The wallet correlates them by feeding each Michelson op hash through the relayer's `l1OpHashToEvmHash` and matching against the EVM-side hash. The two records become **one row**, identified by `x:{l1OpHash}`, tagged `cross-runtime`, with both explorer links present: the primary points at the side the user signed on (tzkt for tz1-source), and a secondary icon-button opens the other side.

When the EVM mirror hasn't yet been observed (the kernel resolution window, ~30 s typical), the row still appears as `cross-runtime` with status `pending` and a single link to tzkt; the next refresh fills in the secondary link.

## Pending cross-runtime ops

A `tz1 → 0x` send broadcast in the last few seconds is held by the relayer (the `RelayerProvider` exposes it via `listPendingOps`) until the kernel resolution completes. Those rows surface in the Activity feed immediately — even before TzKT or Blockscout has them — with `pending` status. Once the op lands on an explorer, the overlay row is dropped in favour of the fetched (and merged) row.

This pending state is **persisted**: the extension stores the relayer's pending-ops snapshot per account in `chrome.storage.local` (`ChromePendingOpsStore`, implementing the relayer's `PendingOpsStore` port), so an in-flight cross-runtime transfer survives locking the wallet, switching accounts, and MV3 service-worker eviction.

## AliasForwarder filter

Under Tezos X's account model, native XTZ sent to a tz1's EVM alias is **forwarded back to the origin tz1** by the kernel's `AliasForwarder`. The transaction is real, but the value lands where it started — showing it as a "Sent" row would be misleading. By default the Activity feed drops these self-transfers. A `filter.includeAliasSelfTransfers: true` knob (no UI affordance yet — exposed in the domain type for a future Settings toggle) puts them back into the list.

## Filters

Top of the list: a direction segmented control (**All / Sent / Received**) and a runtime filter behind an icon button, opening a popover with four options: **Any / Michelson / EVM / Cross-runtime**. When a non-default runtime filter is active, an inline chip with the runtime colour swatch appears next to the segment, with an × to clear it. Filtering is **client-side** over the already-fetched window. Changing a filter refetches from `cursor = undefined` so the new view starts fresh.

## Pagination

`ACTIVITY_PAGE_SIZE = 25` items per source per call. A "Load more" button at the bottom appends the next window via an opaque cursor; the cursor is a base64-encoded JSON blob aggregating per-source pagination state (TzKT's `lastId`, Blockscout's block position). The popup never inspects it — it passes the string through to the SW and back.

## Auto-refresh and the "N new" pill

Every `ACTIVITY_AUTO_REFRESH_MS` (30 seconds by default), the page polls a fresh first window via `LIST_ACTIVITY`. **It does not overwrite the visible list.** Anything new lands in a `pending` buffer. When the buffer is non-empty, a sticky pill at the top of the list reads `N new activity · refresh`. Clicking the pill promotes the buffer in front of the existing rows; the scroll offset is anchored so the row the user was reading stays in place.

The manual refresh button in the TopBar behaves differently — it triggers an **immediate in-place merge** because the user is explicitly asking for fresh data.

## Error handling

A partial fetch failure (TzKT down, Blockscout rate-limited) surfaces as a danger Toast with a retry button. The already-rendered list is **not cleared** — `staleness: 'partial'` is treated as "we have what we have, the other source is down". A full failure (both sources rejected) raises `staleness: 'cached-only'` and the page renders whatever was last in state until the next successful poll cycle.

## See also

- [Send XTZ](./send-xtz) — the live status timeline a fresh send shows before it lands here
- [Custom tokens](./custom-tokens) — which ERC-20 transfers the feed decodes
