/**
 * listActivity: calls the wired ActivityFetchers in
 * parallel, dedupes cross-runtime tz1→0x ops by feeding each L1 opHash
 * through l1OpHashToEvmHash to find the kernel-synthesized EVM mirror,
 * overlays pending L1→L2 ops from RelayerProvider.listPendingOps, filters
 * the AliasForwarder self-transfer by default, sorts by timestamp
 * descending, and returns an ActivityPage with an opaque cursor.
 */

// Import the pure synthetic-hash helper from its own module, NOT the
// '@tezosx/relayer/tezos' barrel — the barrel re-exports BeaconClient, which
// pulls the Beacon SDK (and a Node-only `crypto` import) into every consumer's
// bundle. The mobile (Metro/Hermes) bundle can't resolve that; the extension
// doesn't need it either.
import { l1OpHashToEvmHash } from '@tezosx/relayer/use-cases/build-synthetic-receipt';
import { ACTIVITY_PAGE_SIZE, EVM_EXPLORER, TEZOS_EXPLORER } from '../shared/constants';
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type ActivityFetchError,
  type ActivityFilter,
  type ActivityItem,
  type ActivityPage,
  type ActivityTransferItem,
} from '../domain/activity';
import { XTZ_L1_ASSET } from '../domain/asset';
import type { ActivityFetcher, ActivityFetcherPage } from '../ports/activity-fetcher';
import type { Container } from '../ports/container';
import type { SnapshotStore } from '../ports/snapshot-store';
import type { AccountId } from '../domain/account';

export interface ListActivityReq {
  cursor?: string;
  limit?:  number;
  filter?: ActivityFilter;
}

export interface ListActivityDeps {
  container: Container;
  /** The active account's EVM alias from the EvmAliasCache — passed in, never
   *  derived here, so an unresolved alias degrades the EVM source instead of
   *  rejecting the whole feed (the pre-fetch derive was what made Activity
   *  fail wholesale offline). null for a Tezos account = alias not yet known. */
  evmAlias:      string | null;
  /** First-page persistence: fresh reads are written back, and when every
   *  live source fails the page is served from here as 'cached-only'. */
  snapshotStore: SnapshotStore;
  accountId:     AccountId;
}

interface ResolvedHolders {
  tezos?: string;
  evm?:   string;
}

function resolveHolders(container: Container, evmAlias: string | null): ResolvedHolders {
  const account = container.signer.account;
  if (account.kind === 'tezos') {
    return { tezos: account.tz1, evm: evmAlias ?? undefined };
  }
  return { evm: account.address };
}

async function safeFetch(
  fetcher: ActivityFetcher | undefined,
  holder:  string | undefined,
  limit:   number,
  cursor:  string | undefined,
): Promise<{ ok: true; page: ActivityFetcherPage } | { ok: false; error: Error }> {
  if (fetcher == null || holder == null) {
    return { ok: true, page: { items: [], cursor: undefined } };
  }
  try {
    const page = await fetcher.list({ holder, limit, cursor });
    return { ok: true, page };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function mergeCrossRuntime(
  tezosItems: ActivityItem[],
  evmItems:   ActivityItem[],
): { merged: ActivityItem[]; consumedEvmIds: Set<string> } {
  const merged: ActivityItem[]   = [];
  const consumedEvmIds            = new Set<string>();
  const evmByHash                 = new Map<string, ActivityItem>();
  for (const e of evmItems) evmByHash.set(extractEvmHash(e), e);

  for (const t of tezosItems) {
    if (t.kind === 'transfer' && t.crossRuntime?.direction === 'tezos-to-evm') {
      const synthHash = l1OpHashToEvmHash(t.crossRuntime.l1OpHash).toLowerCase();
      const match     = evmByHash.get(synthHash);
      if (match != null) {
        consumedEvmIds.add(match.id);
        merged.push(mergeOne(t as ActivityTransferItem, match));
        continue;
      }
      // Mirror not yet visible on Blockscout — keep the tz row as cross-runtime
      // candidate with evmEffectStatus 'unresolved' and re-id to x:{l1OpHash}
      // so pending-ops dedup and later re-fetches find it.
      merged.push({
        ...t,
        id:      `x:${t.crossRuntime.l1OpHash}`,
        runtime: 'cross-runtime',
      });
      continue;
    }
    merged.push(t);
  }
  return { merged, consumedEvmIds };
}

function extractEvmHash(item: ActivityItem): string {
  if (item.kind === 'signature') return '';
  // l2 ids are 'l2:<hash>'
  return item.id.startsWith('l2:') ? item.id.slice(3).toLowerCase() : '';
}

function mergeOne(
  tezosItem: ActivityTransferItem,
  evmItem:   ActivityItem,
): ActivityTransferItem {
  const l2Hash = extractEvmHash(evmItem);
  const evmStatus: ActivityTransferItem['status'] =
    evmItem.kind === 'transfer' || evmItem.kind === 'contract-call' ? evmItem.status :
    evmItem.kind === 'signature'                                    ? evmItem.status :
                                                                      'pending';
  return {
    ...tezosItem,
    id:           `x:${tezosItem.crossRuntime!.l1OpHash}`,
    runtime:      'cross-runtime',
    timestamp:    Math.max(tezosItem.timestamp, evmItem.timestamp),
    status:       worseStatus(tezosItem.status, evmStatus),
    links:        {
      primary:   tezosItem.links.primary,
      secondary: { explorer: 'blockscout', url: `${EVM_EXPLORER}/tx/${l2Hash}` },
    },
    crossRuntime: {
      ...tezosItem.crossRuntime!,
      l2TxHash:        l2Hash,
      evmEffectStatus: evmStatus === 'confirmed' ? 'confirmed'
                     : evmStatus === 'failed'    ? 'failed'
                     :                              'pending',
    },
  };
}

function worseStatus(a: ActivityTransferItem['status'], b: ActivityTransferItem['status']): ActivityTransferItem['status'] {
  if (a === 'failed'  || b === 'failed')  return 'failed';
  if (a === 'pending' || b === 'pending') return 'pending';
  return 'confirmed';
}

function applyFilter(items: ActivityItem[], filter: ActivityFilter | undefined, evmHolderLc: string): ActivityItem[] {
  const dropAliasSelf = filter?.includeAliasSelfTransfers !== true;
  return items.filter((it) => {
    if (it.kind === 'signature' || it.kind === 'unknown') {
      // Signatures and unknowns don't participate in direction/runtime filters.
      return true;
    }
    if (filter?.direction && filter.direction.length > 0) {
      const dir = it.kind === 'transfer' ? it.direction : 'sent';
      if (!filter.direction.includes(dir)) return false;
    }
    if (filter?.runtime && filter.runtime.length > 0) {
      if (!filter.runtime.includes(it.runtime)) return false;
    }
    if (dropAliasSelf
        && it.kind === 'transfer'
        && it.runtime === 'cross-runtime'
        && it.crossRuntime?.direction === 'tezos-to-evm'
        && it.counterparty.toLowerCase() === evmHolderLc) {
      return false;
    }
    return true;
  });
}

export async function listActivity(
  req:  ListActivityReq,
  deps: ListActivityDeps,
): Promise<ActivityPage> {
  const limit  = req.limit ?? ACTIVITY_PAGE_SIZE;
  const cursor = decodeActivityCursor(req.cursor);

  const account     = deps.container.signer.account;
  const holders     = resolveHolders(deps.container, deps.evmAlias);
  const evmHolderLc = holders.evm?.toLowerCase() ?? '';

  const [tz, ev] = await Promise.all([
    safeFetch(deps.container.activitySources.tezos, holders.tezos, limit, cursor.tezos != null ? String(cursor.tezos.lastId) : undefined),
    safeFetch(deps.container.activitySources.evm,   holders.evm,   limit, cursor.evm   != null ? String(cursor.evm.block)    : undefined),
  ]);

  const errors: ActivityFetchError[] = [];
  const tzItems  = tz.ok ? tz.page.items  : [];
  const evItems  = ev.ok ? ev.page.items  : [];
  const nextTz   = tz.ok ? tz.page.cursor : undefined;
  const nextEv   = ev.ok ? ev.page.cursor : undefined;
  if (!tz.ok) errors.push({ source: 'tezos', message: tz.error.message });
  if (!ev.ok) errors.push({ source: 'evm',   message: ev.error.message });
  // A Tezos account whose alias hasn't resolved yet: safeFetch politely
  // returned an empty page (holder undefined), but the EVM half of the feed
  // is genuinely unavailable — report it so the staleness is 'partial', not a
  // false 'fresh'.
  if (account.kind === 'tezos' && holders.evm == null) {
    errors.push({ source: 'evm', message: 'EVM alias not resolved yet' });
  }

  // Step 1: dedup tz1→0x against its kernel-synthesized EVM mirror.
  const { merged, consumedEvmIds } = mergeCrossRuntime(tzItems, evItems);

  // Step 2: append the EVM items not consumed by the dedup (native L2 +
  // evm-to-tezos precompile calls).
  for (const e of evItems) {
    if (consumedEvmIds.has(e.id)) continue;
    merged.push(e);
  }

  // Step 3: overlay pending L1→L2 ops the kernel hasn't surfaced yet.
  const pending = deps.container.activitySources.pendingOps?.() ?? [];
  for (const p of pending) {
    const alreadyInList = merged.some(
      (m) => m.kind !== 'signature'
          && m.kind !== 'unknown'
          && 'crossRuntime' in m
          && m.crossRuntime?.l1OpHash === p.l1OpHash,
    );
    if (alreadyInList) continue;
    const item: ActivityTransferItem = {
      id:           `x:${p.l1OpHash}`,
      kind:         'transfer',
      direction:    'sent',
      runtime:      'cross-runtime',
      counterparty: p.to,
      asset:        XTZ_L1_ASSET,
      amount:       '0',                                      // unknown until TzKT surfaces the op
      timestamp:    p.broadcastedAt,
      status:       'pending',
      links:        { primary: { explorer: 'tzkt', url: `${TEZOS_EXPLORER}/${p.l1OpHash}` } },
      crossRuntime: {
        direction:       'tezos-to-evm',
        l1OpHash:        p.l1OpHash,
        evmEffectStatus: 'pending',
      },
    };
    merged.push(item);
  }

  // Step 4: filter + sort + slice.
  const filtered = applyFilter(merged, req.filter, evmHolderLc);
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  const sliced = filtered.slice(0, limit);

  // Aggregate cursor: re-encode the per-source next cursors as a single
  // opaque string the UI carries forward.
  const nextCursor = (nextTz != null || nextEv != null)
    ? encodeActivityCursor({
        tezos: nextTz != null ? { lastId: parseInt(nextTz, 10) } : undefined,
        evm:   nextEv != null ? { block:  parseInt(nextEv, 10), index: 0 } : undefined,
      })
    : undefined;

  const allSourcesFailed = !tz.ok && !ev.ok;
  const isFirstPage      = req.cursor == null;

  // Every live source failed on the first page: serve the persisted snapshot
  // as an honest 'cached-only' page (its own filter re-applied, no pagination
  // — cursors need live sources), stamped with the time it was fetched.
  if (allSourcesFailed && isFirstPage) {
    const snap = await deps.snapshotStore.loadActivity(deps.accountId).catch(() => null);
    if (snap != null && snap.data.length > 0) {
      const cachedFiltered = applyFilter(snap.data, req.filter, evmHolderLc);
      return {
        items:     cachedFiltered.slice(0, limit),
        cursor:    undefined,
        staleness: 'cached-only',
        errors,
        fetchedAt: snap.fetchedAt,
      };
    }
  }

  const staleness: ActivityPage['staleness'] =
    errors.length === 0 ? 'fresh' :
    !allSourcesFailed   ? 'partial' :
                          'cached-only';

  const now = Date.now();

  // Write-back: a fully fresh first page becomes the offline fallback. The
  // pre-filter merged list is stored so a later cached read can apply the
  // request's own filter. Partial pages are not persisted — overwriting a
  // complete snapshot with half a feed would lose data.
  if (staleness === 'fresh' && isFirstPage) {
    const toStore = merged.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    void deps.snapshotStore.saveActivity(deps.accountId, { data: toStore, fetchedAt: now })
      .catch(() => { /* best-effort persistence */ });
  }

  return {
    items:    sliced,
    cursor:   nextCursor,
    staleness,
    errors:   errors.length > 0 ? errors : undefined,
    fetchedAt: now,
  };
}