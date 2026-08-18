/**
 * ChromeSnapshotStore: SnapshotStore backed by chrome.storage.local, keyed by
 * `snapshot:<accountId>:balances` / `snapshot:<accountId>:activity`.
 *
 * Unlike the token store, clear() sweeps by prefix over
 * chrome.storage.local.get(null) instead of maintaining a key index: snapshots
 * are written from two contexts (the service worker via core's write-back, the
 * popup via popup-snapshot-store), and a shared read-modify-write index would
 * race between them — chrome.storage has no transactions, so a lost index
 * update would leave an orphan key that clear() misses. The prefix sweep has
 * no such failure mode.
 */

import type {
  BalancesSnapshotData,
  SnapshotEntry,
  SnapshotStore,
} from '@tezosx/wallet-core/ports/snapshot-store';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';

const KEY_PREFIX = 'snapshot:';

/** Single source of truth for the snapshot key scheme — the popup-side
 *  adapter reuses these so both contexts address the same entries. */
export function balancesSnapshotKey(accountId: AccountId): string {
  return `${KEY_PREFIX}${accountId}:balances`;
}

export function activitySnapshotKey(accountId: AccountId): string {
  return `${KEY_PREFIX}${accountId}:activity`;
}

async function loadEntry<T>(key: string): Promise<SnapshotEntry<T> | null> {
  const data  = await chrome.storage.local.get(key);
  const entry = data[key] as SnapshotEntry<T> | undefined;
  if (entry == null || typeof entry.fetchedAt !== 'number' || entry.data == null) return null;
  return entry;
}

export class ChromeSnapshotStore implements SnapshotStore {
  async loadBalances(accountId: AccountId): Promise<SnapshotEntry<BalancesSnapshotData> | null> {
    return loadEntry<BalancesSnapshotData>(balancesSnapshotKey(accountId));
  }

  async saveBalances(accountId: AccountId, entry: SnapshotEntry<BalancesSnapshotData>): Promise<void> {
    await chrome.storage.local.set({ [balancesSnapshotKey(accountId)]: entry });
  }

  async loadActivity(accountId: AccountId): Promise<SnapshotEntry<ActivityItem[]> | null> {
    return loadEntry<ActivityItem[]>(activitySnapshotKey(accountId));
  }

  async saveActivity(accountId: AccountId, entry: SnapshotEntry<ActivityItem[]>): Promise<void> {
    await chrome.storage.local.set({ [activitySnapshotKey(accountId)]: entry });
  }

  async clearAccount(accountId: AccountId): Promise<void> {
    await chrome.storage.local.remove([
      balancesSnapshotKey(accountId),
      activitySnapshotKey(accountId),
    ]);
  }

  async clear(): Promise<void> {
    const all  = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  }
}
