/**
 * MmkvAliasStore — the MMKV persistence behind EvmAliasCache. The port
 * contract it must honour: load() round-trips what save() wrote, and
 * missing or corrupt storage yields {} (the cache starts cold and the
 * backfill re-resolves) instead of throwing into the unlock path.
 */

import { describe, expect, it } from 'vitest';
import type { MMKV } from 'react-native-mmkv';
import { MmkvAliasStore } from '../mmkv-alias-store';

/** Minimal in-memory stand-in for the string subset of MMKV the store uses. */
function fakeMmkv(seed: Record<string, string> = {}): MMKV {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getString: (key: string) => map.get(key),
    set: (key: string, value: string) => { map.set(key, value); },
    remove: (key: string) => map.delete(key),
    getAllKeys: () => [...map.keys()],
  } as unknown as MMKV;
}

describe('MmkvAliasStore', () => {
  it('round-trips the alias map', async () => {
    const store = new MmkvAliasStore(fakeMmkv());
    const entries = {
      tz1AliceAddress: '0x1111111111111111111111111111111111111111',
      tz1BobAddress:   '0x2222222222222222222222222222222222222222',
    };

    await store.save(entries);

    await expect(store.load()).resolves.toEqual(entries);
  });

  it('save replaces the whole map (write-through semantics)', async () => {
    const store = new MmkvAliasStore(fakeMmkv());
    await store.save({ tz1AliceAddress: '0xaaaa' });
    await store.save({ tz1BobAddress: '0xbbbb' });

    await expect(store.load()).resolves.toEqual({ tz1BobAddress: '0xbbbb' });
  });

  it('missing storage yields {}', async () => {
    const store = new MmkvAliasStore(fakeMmkv());
    await expect(store.load()).resolves.toEqual({});
  });

  it('corrupt storage yields {} instead of throwing', async () => {
    const store = new MmkvAliasStore(fakeMmkv({ evmAliases: '{not json' }));
    await expect(store.load()).resolves.toEqual({});
  });

  it('a non-object JSON value yields {}', async () => {
    const store = new MmkvAliasStore(fakeMmkv({ evmAliases: '["not","a","map"]' }));
    await expect(store.load()).resolves.toEqual({});
  });

  it('clear drops the persisted map', async () => {
    const store = new MmkvAliasStore(fakeMmkv());
    await store.save({ tz1AliceAddress: '0xaaaa' });

    await store.clear();

    await expect(store.load()).resolves.toEqual({});
  });
});
