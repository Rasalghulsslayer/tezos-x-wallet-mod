/**
 * SnapshotStore: persisted last-known read models (balances, first activity
 * page) per account, each stamped with the time it was fetched. This is what
 * lets the UI render honest data offline — a cached value labeled with its
 * age — instead of a false zero or an empty state.
 *
 * Only public chain data belongs here (values anyone can compute from the
 * addresses). Never anything secret-derived, never fee/gas material (signing
 * must use fresh data), never pending approvals. Cleared on wallet reset;
 * per-account entries dropped on account removal.
 */

import type { AccountId } from '../domain/account';
import type { ActivityItem } from '../domain/activity';

export interface SnapshotEntry<T> {
  data:      T;
  /** Epoch ms at which this data was fetched live. */
  fetchedAt: number;
}

export interface BalancesSnapshotData {
  /** Native balance in the account's display unit; null = never fetched. */
  xtz:   string | null;
  /** ERC-20 balances keyed by lowercase token address. */
  erc20: Record<string, string>;
}

export interface SnapshotStore {
  loadBalances(accountId: AccountId): Promise<SnapshotEntry<BalancesSnapshotData> | null>;
  saveBalances(accountId: AccountId, entry: SnapshotEntry<BalancesSnapshotData>): Promise<void>;
  loadActivity(accountId: AccountId): Promise<SnapshotEntry<ActivityItem[]> | null>;
  saveActivity(accountId: AccountId, entry: SnapshotEntry<ActivityItem[]>): Promise<void>;
  /** Drop every snapshot belonging to one account (account removal hygiene). */
  clearAccount(accountId: AccountId): Promise<void>;
  clear(): Promise<void>;
}
