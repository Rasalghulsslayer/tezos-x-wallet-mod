/**
 * MmkvSnapshotStore: the per-account last-known read models (balances, first
 * activity page) in MMKV, one JSON entry per `snapshot:<accountId>:<kind>`
 * key. Only public chain data is stored — values anyone can compute from the
 * addresses — so it lives in plain storage like the alias map. clear() removes
 * every snapshot key while leaving the rest of the shared MMKV instance
 * (vault, sessions, tokens) untouched.
 */

import type { MMKV } from 'react-native-mmkv';
import type {
  BalancesSnapshotData,
  SnapshotEntry,
  SnapshotStore,
} from '@tezosx/wallet-core/ports/snapshot-store';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';

const PREFIX = 'snapshot:';

const balancesKey = (accountId: AccountId): string => `${PREFIX}${accountId}:balances`;
const activityKey = (accountId: AccountId): string => `${PREFIX}${accountId}:activity`;

export class MmkvSnapshotStore implements SnapshotStore {
  constructor(private readonly mmkv: MMKV) {}

  private read<T>(key: string): SnapshotEntry<T> | null {
    const raw = this.mmkv.getString(key);
    if (raw == null) return null;
    // A corrupt entry reads as "no snapshot" — the UI falls back to the
    // no-cache state instead of rendering garbage.
    try {
      return JSON.parse(raw) as SnapshotEntry<T>;
    } catch {
      return null;
    }
  }

  async loadBalances(accountId: AccountId): Promise<SnapshotEntry<BalancesSnapshotData> | null> {
    return this.read<BalancesSnapshotData>(balancesKey(accountId));
  }

  async saveBalances(accountId: AccountId, entry: SnapshotEntry<BalancesSnapshotData>): Promise<void> {
    this.mmkv.set(balancesKey(accountId), JSON.stringify(entry));
  }

  async loadActivity(accountId: AccountId): Promise<SnapshotEntry<ActivityItem[]> | null> {
    return this.read<ActivityItem[]>(activityKey(accountId));
  }

  async saveActivity(accountId: AccountId, entry: SnapshotEntry<ActivityItem[]>): Promise<void> {
    this.mmkv.set(activityKey(accountId), JSON.stringify(entry));
  }

  async clearAccount(accountId: AccountId): Promise<void> {
    this.mmkv.remove(balancesKey(accountId));
    this.mmkv.remove(activityKey(accountId));
  }

  async clear(): Promise<void> {
    for (const key of this.mmkv.getAllKeys()) {
      if (key.startsWith(PREFIX)) this.mmkv.remove(key);
    }
  }
}
