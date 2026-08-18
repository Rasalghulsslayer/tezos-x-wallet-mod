/**
 * MmkvSnapshotStore — the per-account last-known read models in MMKV. Pins
 * the round-trips, the per-account clearAccount scope, and that clear() only
 * removes snapshot-prefixed keys: the store shares its MMKV instance with the
 * vault / sessions / tokens, which a wallet-data wipe must never touch.
 */

import { describe, expect, it } from 'vitest';
import type { MMKV } from 'react-native-mmkv';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import { XTZ_L1_ASSET } from '@tezosx/wallet-core/domain/asset';
import { MmkvSnapshotStore } from '../mmkv-snapshot-store';

/** Minimal in-memory stand-in for the string subset of MMKV the store uses. */
function fakeMmkv(seed: Record<string, string> = {}): { mmkv: MMKV; keys: () => string[] } {
  const map = new Map<string, string>(Object.entries(seed));
  const mmkv = {
    getString: (key: string) => map.get(key),
    set: (key: string, value: string) => { map.set(key, value); },
    remove: (key: string) => map.delete(key),
    getAllKeys: () => [...map.keys()],
  } as unknown as MMKV;
  return { mmkv, keys: () => [...map.keys()] };
}

const BALANCES = {
  data:      { xtz: '12.5', erc20: { '0xabc0000000000000000000000000000000000def': '3.14' } },
  fetchedAt: 1_753_000_000_000,
};

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id:           'l1:opHash1',
    kind:         'transfer',
    direction:    'sent',
    runtime:      'l1',
    counterparty: 'tz1CounterpartyAddress',
    asset:        XTZ_L1_ASSET,
    amount:       '1500000',
    timestamp:    1_752_999_000_000,
    status:       'confirmed',
    links:        { primary: { explorer: 'tzkt', url: 'https://tzkt.example/opHash1' } },
  },
];

describe('MmkvSnapshotStore', () => {
  it('round-trips a balances snapshot per account', async () => {
    const store = new MmkvSnapshotStore(fakeMmkv().mmkv);

    await store.saveBalances('acc-a', BALANCES);

    await expect(store.loadBalances('acc-a')).resolves.toEqual(BALANCES);
    await expect(store.loadBalances('acc-b')).resolves.toBeNull();
  });

  it('round-trips an activity snapshot per account', async () => {
    const store = new MmkvSnapshotStore(fakeMmkv().mmkv);
    const entry = { data: ACTIVITY_ITEMS, fetchedAt: 1_753_000_000_000 };

    await store.saveActivity('acc-a', entry);

    await expect(store.loadActivity('acc-a')).resolves.toEqual(entry);
    await expect(store.loadActivity('acc-b')).resolves.toBeNull();
  });

  it('missing and corrupt entries read as null', async () => {
    const store = new MmkvSnapshotStore(fakeMmkv({ 'snapshot:acc-a:balances': '{not json' }).mmkv);

    await expect(store.loadBalances('acc-a')).resolves.toBeNull();
    await expect(store.loadActivity('acc-a')).resolves.toBeNull();
  });

  it('clearAccount drops both snapshots of that account only', async () => {
    const store = new MmkvSnapshotStore(fakeMmkv().mmkv);
    await store.saveBalances('acc-a', BALANCES);
    await store.saveActivity('acc-a', { data: ACTIVITY_ITEMS, fetchedAt: 1 });
    await store.saveBalances('acc-b', BALANCES);

    await store.clearAccount('acc-a');

    await expect(store.loadBalances('acc-a')).resolves.toBeNull();
    await expect(store.loadActivity('acc-a')).resolves.toBeNull();
    await expect(store.loadBalances('acc-b')).resolves.toEqual(BALANCES);
  });

  it('clear removes every snapshot but leaves the rest of the MMKV instance alone', async () => {
    const { mmkv, keys } = fakeMmkv({ vault: 'sealed-vault-blob', contacts: '[]' });
    const store = new MmkvSnapshotStore(mmkv);
    await store.saveBalances('acc-a', BALANCES);
    await store.saveActivity('acc-b', { data: ACTIVITY_ITEMS, fetchedAt: 1 });

    await store.clear();

    await expect(store.loadBalances('acc-a')).resolves.toBeNull();
    await expect(store.loadActivity('acc-b')).resolves.toBeNull();
    // The shared instance's other keys (vault, contacts, …) are untouched.
    expect(keys().sort()).toEqual(['contacts', 'vault']);
  });
});
