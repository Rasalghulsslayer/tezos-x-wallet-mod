/**
 * listActivity: calls the wired ActivityFetchers in
 * parallel, dedupes cross-runtime tz1→0x ops by feeding each L1 opHash
 * through l1OpHashToEvmHash to find the kernel-synthesized EVM mirror,
 * overlays pending L1→L2 ops from RelayerProvider.listPendingOps, filters
 * the AliasForwarder self-transfer by default, sorts by timestamp
 * descending, and returns an ActivityPage with an opaque cursor.
 */

import { l1OpHashToEvmHash } from '@tezosx/relayer/tezos';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { ACTIVITY_PAGE_SIZE, EVM_EXPLORER, TEZOS_EXPLORER } from '@tezosx/wallet-core/shared/constants';
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type ActivityFetchError,
  type ActivityFilter,
  type ActivityItem,
  type ActivityPage,
  type ActivityTransferItem,
} from '@tezosx/wallet-core/domain/activity';
import { XTZ_L1_ASSET } from '@tezosx/wallet-core/domain/asset';
import type { ActivityFetcher, ActivityFetcherPage } from '@tezosx/wallet-core/ports/activity-fetcher';
import type { Container } from '@tezosx/wallet-core/ports/container';

export interface ListActivityReq {
  cursor?: string;
  limit?:  number;
  filter?: ActivityFilter;
}

export interface ListActivityDeps {
  container: Container;
}

interface ResolvedHolders {
  tezos?: string;
  evm:    string;
}

async function resolveHolders(container: Container): Promise<ResolvedHolders> {
  const account = container.signer.account;
  if (account.kind === 'tezos') {
    return { tezos: account.tz1, evm: await deriveEvmAlias(account.tz1) };
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

  const holders = await resolveHolders(deps.container);
  const evmHolderLc = holders.evm.toLowerCase();

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

  const staleness: ActivityPage['staleness'] =
    errors.length === 0 ? 'fresh' :
    errors.length === 1 ? 'partial' :
                          'cached-only';

  return {
    items:    sliced,
    cursor:   nextCursor,
    staleness,
    errors:   errors.length > 0 ? errors : undefined,
  };
}