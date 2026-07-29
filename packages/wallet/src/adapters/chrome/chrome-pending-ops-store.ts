/**
 * ChromePendingOpsStore: persists the RelayerProvider's cross-runtime
 * resolution state per account in chrome.storage.local, so a synthetic→real
 * hash mapping survives lock / account switch / MV3 service-worker eviction.
 */

import type { PendingOpsStore, PendingOpsSnapshot } from '@tezosx/relayer/tezos';

const PREFIX = 'pendingOps:';

export class ChromePendingOpsStore implements PendingOpsStore {
  private readonly key: string;
  constructor(accountId: string) {
    this.key = `${PREFIX}${accountId}`;
  }

  async load(): Promise<PendingOpsSnapshot | undefined> {
    const data = await chrome.storage.local.get(this.key);
    return data[this.key] as PendingOpsSnapshot | undefined;
  }

  async save(snapshot: PendingOpsSnapshot): Promise<void> {
    await chrome.storage.local.set({ [this.key]: snapshot });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(this.key);
  }
}
