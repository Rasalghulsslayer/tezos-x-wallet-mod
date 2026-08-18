/**
 * ChromeSnapshotStore pins the storage key scheme (`snapshot:<id>:balances` /
 * `snapshot:<id>:activity`) that both the service worker and the popup-side
 * adapter address, plus the account-removal and full-reset hygiene: a snapshot
 * that outlives its vault would leak the wallet's balance history.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ChromeSnapshotStore,
  activitySnapshotKey,
  balancesSnapshotKey,
} from '../chrome-snapshot-store';
import { loadBalancesSnapshot, saveBalancesSnapshot } from '../popup-snapshot-store';
import type { SnapshotEntry, BalancesSnapshotData } from '@tezosx/wallet-core/ports/snapshot-store';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';

function stubChromeStorage(): Map<string, unknown> {
  const data = new Map<string, unknown>();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => {
          const out: Record<string, unknown> = {};
          const list = keys == null ? [...data.keys()] : typeof keys === 'string' ? [keys] : keys;
          for (const k of list) if (data.has(k)) out[k] = data.get(k);
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) data.set(k, v);
        },
        remove: async (keys: string | string[]) => {
          for (const k of typeof keys === 'string' ? [keys] : keys) data.delete(k);
        },
      },
    },
  });
  return data;
}

const BALANCES: SnapshotEntry<BalancesSnapshotData> = {
  data:      { xtz: '12.5', erc20: { '0xabc0000000000000000000000000000000000001': '0x64' } },
  fetchedAt: 1_700_000_000_000,
};

const ACTIVITY: SnapshotEntry<ActivityItem[]> = { data: [], fetchedAt: 1_700_000_000_000 };

describe('ChromeSnapshotStore', () => {
  let raw: Map<string, unknown>;
  beforeEach(() => { raw = stubChromeStorage(); });
  afterEach(() => vi.unstubAllGlobals());

  it('writes balances under snapshot:<accountId>:balances and reads them back', async () => {
    const store = new ChromeSnapshotStore();
    await store.saveBalances('acc-1', BALANCES);
    expect(raw.has('snapshot:acc-1:balances')).toBe(true);
    expect(await store.loadBalances('acc-1')).toEqual(BALANCES);
  });

  it('writes activity under snapshot:<accountId>:activity', async () => {
    const store = new ChromeSnapshotStore();
    await store.saveActivity('acc-1', ACTIVITY);
    expect(raw.has('snapshot:acc-1:activity')).toBe(true);
    expect(await store.loadActivity('acc-1')).toEqual(ACTIVITY);
  });

  it('returns null for a missing or malformed entry', async () => {
    const store = new ChromeSnapshotStore();
    expect(await store.loadBalances('nobody')).toBeNull();
    raw.set(balancesSnapshotKey('acc-1'), { data: { xtz: null, erc20: {} } }); // no fetchedAt
    expect(await store.loadBalances('acc-1')).toBeNull();
  });

  it('clearAccount removes both of the account entries and nothing else', async () => {
    const store = new ChromeSnapshotStore();
    await store.saveBalances('acc-1', BALANCES);
    await store.saveActivity('acc-1', ACTIVITY);
    await store.saveBalances('acc-2', BALANCES);

    await store.clearAccount('acc-1');
    expect(await store.loadBalances('acc-1')).toBeNull();
    expect(await store.loadActivity('acc-1')).toBeNull();
    expect(await store.loadBalances('acc-2')).toEqual(BALANCES);
  });

  it('clear sweeps every snapshot:* key but leaves foreign keys alone', async () => {
    const store = new ChromeSnapshotStore();
    await store.saveBalances('acc-1', BALANCES);
    await store.saveActivity('acc-2', ACTIVITY);
    raw.set('contacts', ['not-a-snapshot']);
    raw.set('evmAliases', { tz1a: '0xab' });

    await store.clear();
    expect(raw.has(balancesSnapshotKey('acc-1'))).toBe(false);
    expect(raw.has(activitySnapshotKey('acc-2'))).toBe(false);
    expect(raw.has('contacts')).toBe(true);
    expect(raw.has('evmAliases')).toBe(true);
  });
});

describe('popup-snapshot-store', () => {
  let raw: Map<string, unknown>;
  beforeEach(() => { raw = stubChromeStorage(); });
  afterEach(() => vi.unstubAllGlobals());

  it('addresses the same keys as the service-worker store', async () => {
    await saveBalancesSnapshot('acc-1', BALANCES);
    expect(raw.has(balancesSnapshotKey('acc-1'))).toBe(true);
    // What the SW's write-back stores, the popup's read-through finds.
    expect(await loadBalancesSnapshot('acc-1')).toEqual(BALANCES);
    expect(await new ChromeSnapshotStore().loadBalances('acc-1')).toEqual(BALANCES);
  });

  it('degrades to null / no-op instead of throwing on storage failure', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => { throw new Error('storage gone'); },
          set: async () => { throw new Error('storage gone'); },
        },
      },
    });
    expect(await loadBalancesSnapshot('acc-1')).toBeNull();
    await expect(saveBalancesSnapshot('acc-1', BALANCES)).resolves.toBeUndefined();
  });
});
