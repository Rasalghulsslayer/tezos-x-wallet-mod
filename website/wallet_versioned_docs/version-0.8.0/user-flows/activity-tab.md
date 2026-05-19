---
id: activity-tab
title: Activity tab
sidebar_label: Activity
---

# Activity tab

Since **wallet 0.8.0** the Activity tab is functional. It shows a merged feed of historical transactions across both Tezos X runtimes — Michelson L1 ops from TzKT and EVM transactions from Blockscout — auto-refreshed every 30 seconds with a Twitter-style "N new" pill so the list doesn't move under you while you're reading.

## What's in the feed

For a **Michelson (`tz1`) account**: both sides are queried. Native tz1 transfers, NAC gateway calls (cross-runtime sends through `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`), and any Michelson contract call land here, alongside EVM-side rows for any cross-runtime op the kernel has mirrored to the user's derived EVM alias.

For an **EVM-native (`0x`) account**: only the EVM side is meaningful. Native L2 transfers, NAC precompile calls to `0xff…007` (cross-runtime back to a tz1), and generic EVM contract calls. The Michelson alias of an EVM-native account is a kernel-managed KT1 with no user-meaningful op history.

## Cross-runtime dedup

A single `tz1 → 0x` send produces **two records** — one L1 op on TzKT, one kernel-synthesized EVM tx on Blockscout (with a deterministic hash derived from the L1 opHash). The wallet correlates them by feeding each L1 opHash through `@tezosx/relayer/tezos`'s `l1OpHashToEvmHash` and matching against the EVM-side hash. The two records become one row, identified by `x:{l1OpHash}`, with both explorer links present: the primary points at the side the user signed on (tzkt for tz1-source, blockscout for 0x-source), and a secondary icon-button opens the other side.

When the EVM mirror hasn't yet been observed (the kernel resolution window, ~30 s typical), the row still appears as `cross-runtime` with status `pending` and a single link to tzkt; the next refresh fills in the secondary link.

## Pending L1→L2 ops

A `tz1 → 0x` send broadcast in the last few seconds is held in `RelayerProvider.listPendingOps` (added in `@tezosx/relayer` 0.5.1) until the kernel resolves the synth hash. Those rows surface in the Activity feed immediately — even before TzKT or Blockscout has them — with the `dots` icon (`pending` status). Once the L1 op lands on TzKT, the pending row is dropped in favour of the TzKT-sourced row.

## AliasForwarder filter

Under Tezos X's account model, native XTZ sent to a tz1's EVM alias is **forwarded back to the origin tz1** by the kernel's `AliasForwarder`. The transaction is real, but the value lands where it started — showing it as a "Sent" row would be misleading. By default the Activity feed drops these self-transfers. A `filter.includeAliasSelfTransfers: true` knob (no UI affordance yet — exposed in the domain type for a future Settings toggle) puts them back into the list.

## Filters

Top of the list: direction chips (All / Sent / Received) and an expandable Runtime row (Any / L1 / L2 / Cross). Filtering is **client-side** over the already-fetched window. Changing a filter refetches from cursor=undefined so the new view starts fresh.

## Pagination

`ACTIVITY_PAGE_SIZE = 25` items per source per call. A "Load more" button at the bottom appends the next window via an opaque cursor; the cursor is a base64-encoded JSON blob aggregating per-source pagination state (TzKT's `lastId`, Blockscout's `page` number). The popup never inspects it — it passes the string through to the SW and back.

## Auto-refresh and the "N new" pill

Every `ACTIVITY_AUTO_REFRESH_MS` (30 seconds by default), the page polls a fresh first window via `LIST_ACTIVITY`. **It does not overwrite the visible list.** Anything new lands in a `pending` buffer. When the buffer is non-empty, a sticky pill at the top of the list reads `N new activity · refresh`. Clicking the pill promotes the buffer in front of the existing rows; the scroll offset is anchored so the row the user was reading stays in place.

The manual refresh button in the TopBar behaves differently — it triggers an **immediate in-place merge** because the user is explicitly asking for fresh data.

## Error handling

A partial fetch failure (TzKT down, Blockscout rate-limited) surfaces as a danger Toast with a retry button. The already-rendered list is **not cleared** — `staleness: 'partial'` is treated as "we have what we have, the other source is down". A full failure (both sources rejected) raises `staleness: 'cached-only'` and the page renders whatever was last in state until the next successful poll cycle.
