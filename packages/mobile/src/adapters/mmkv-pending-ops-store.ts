/**
 * MmkvPendingOpsStore: persists the RelayerProvider's cross-runtime resolution
 * state per account in MMKV, so a synthetic→real hash mapping survives a lock
 * or account switch. Mirrors the extension's ChromePendingOpsStore.
 */

import type { MMKV } from 'react-native-mmkv';
import type { PendingOpsStore, PendingOpsSnapshot } from '@tezosx/relayer/tezos';

const PREFIX = 'pendingOps:';

export class MmkvPendingOpsStore implements PendingOpsStore {
  private readonly key: string;
  constructor(private readonly mmkv: MMKV, accountId: string) {
    this.key = `${PREFIX}${accountId}`;
  }

  async load(): Promise<PendingOpsSnapshot | undefined> {
    const raw = this.mmkv.getString(this.key);
    return raw == null ? undefined : (JSON.parse(raw) as PendingOpsSnapshot);
  }

  async save(snapshot: PendingOpsSnapshot): Promise<void> {
    this.mmkv.set(this.key, JSON.stringify(snapshot));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(this.key);
  }
}
