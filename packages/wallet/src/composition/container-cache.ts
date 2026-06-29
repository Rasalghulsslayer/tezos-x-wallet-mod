/**
 * ContainerCache: in-memory LRU of Container instances keyed by accountId.
 * Evicted on lock / SW death / explicit removeAccount. Keeps active-switch
 * latency under ~50 ms for the realistic 1–15 account range.
 */

import type { Container } from './container';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import { CONTAINER_CACHE_SIZE } from '@tezosx/wallet-core/shared/constants';

export class ContainerCache {
  private readonly map = new Map<AccountId, Container>();
  constructor(private readonly capacity: number = CONTAINER_CACHE_SIZE) {}

  get(accountId: AccountId): Container | undefined {
    const entry = this.map.get(accountId);
    if (entry != null) {
      this.map.delete(accountId);
      this.map.set(accountId, entry);
    }
    return entry;
  }

  put(accountId: AccountId, container: Container): void {
    if (this.map.has(accountId)) this.map.delete(accountId);
    this.map.set(accountId, container);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest == null) break;
      this.map.delete(oldest);
    }
  }

  evict(accountId: AccountId): void {
    this.map.delete(accountId);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
