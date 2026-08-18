import { describe, expect, it, vi } from 'vitest';
import { EvmAliasCache } from '../evm-alias-cache';
import type { AliasStore } from '../../ports/alias-store';

class MemoryAliasStore implements AliasStore {
  entries: Record<string, string> = {};
  async load() { return this.entries; }
  async save(entries: Record<string, string>) { this.entries = { ...entries }; }
  async clear() { this.entries = {}; }
}

const TZ1_A = 'tz1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TZ1_B = 'tz1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('EvmAliasCache', () => {
  it('returns null for unknown entries and the stored alias afterwards', () => {
    const cache = new EvmAliasCache();
    expect(cache.get(TZ1_A)).toBeNull();
    cache.set(TZ1_A, '0xaaaa');
    expect(cache.get(TZ1_A)).toBe('0xaaaa');
    cache.clear();
    expect(cache.get(TZ1_A)).toBeNull();
  });

  it('backfill resolves only the missing entries', async () => {
    const cache = new EvmAliasCache();
    cache.set(TZ1_A, '0xaaaa');
    const derive = vi.fn(async (tz1: string) => `0x-for-${tz1}`);

    const changed = await cache.backfill([TZ1_A, TZ1_B], derive);

    expect(changed).toBe(true);
    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive).toHaveBeenCalledWith(TZ1_B);
    expect(cache.get(TZ1_A)).toBe('0xaaaa');
    expect(cache.get(TZ1_B)).toBe(`0x-for-${TZ1_B}`);
  });

  it('swallows individual failures and retries them on the next kick', async () => {
    const cache = new EvmAliasCache();
    const derive = vi.fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce('0xbbbb');

    expect(await cache.backfill([TZ1_B], derive)).toBe(false);
    expect(cache.get(TZ1_B)).toBeNull();

    // The network came back: the same entry resolves on the next kick.
    expect(await cache.backfill([TZ1_B], derive)).toBe(true);
    expect(cache.get(TZ1_B)).toBe('0xbbbb');
  });

  it('single-flights concurrent backfills instead of stacking RPCs', async () => {
    const cache = new EvmAliasCache();
    let release!: (v: string) => void;
    const derive = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));

    const first  = cache.backfill([TZ1_A], derive);
    const second = cache.backfill([TZ1_A], derive);
    expect(second).toBe(first);
    // The run starts after the (no-op) hydration microtask — flush it before
    // asserting the derive count.
    await new Promise((r) => setTimeout(r, 0));
    expect(derive).toHaveBeenCalledTimes(1);

    release('0xaaaa');
    await first;
    expect(cache.get(TZ1_A)).toBe('0xaaaa');
  });

  it('resolves false immediately when nothing is missing', async () => {
    const cache = new EvmAliasCache();
    cache.set(TZ1_A, '0xaaaa');
    const derive = vi.fn();
    expect(await cache.backfill([TZ1_A], derive)).toBe(false);
    expect(derive).not.toHaveBeenCalled();
  });
});

describe('EvmAliasCache — persistence through an AliasStore', () => {
  it('writes resolved entries through and hydrates them after a restart', async () => {
    const store = new MemoryAliasStore();
    const cache = new EvmAliasCache(store);
    await cache.backfill([TZ1_A], async () => '0xaaaa');
    expect(store.entries[TZ1_A]).toBe('0xaaaa');

    // New process: a fresh cache over the same store needs no derive call.
    const reborn = new EvmAliasCache(store);
    const derive = vi.fn();
    expect(await reborn.backfill([TZ1_A], derive)).toBe(false);
    expect(derive).not.toHaveBeenCalled();
    expect(reborn.get(TZ1_A)).toBe('0xaaaa');
  });

  it('remove() drops the entry from memory and storage', async () => {
    const store = new MemoryAliasStore();
    const cache = new EvmAliasCache(store);
    cache.set(TZ1_A, '0xaaaa');
    cache.set(TZ1_B, '0xbbbb');
    cache.remove(TZ1_A);
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.get(TZ1_A)).toBeNull();
    expect(store.entries).toEqual({ [TZ1_B]: '0xbbbb' });
  });

  it('clear() empties memory and storage (wallet reset)', async () => {
    const store = new MemoryAliasStore();
    const cache = new EvmAliasCache(store);
    cache.set(TZ1_A, '0xaaaa');
    cache.clear();
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.get(TZ1_A)).toBeNull();
    expect(store.entries).toEqual({});
  });

  it('in-memory entries win over persisted ones on hydrate', async () => {
    const store = new MemoryAliasStore();
    store.entries = { [TZ1_A]: '0xstale' };
    const cache = new EvmAliasCache(store);
    cache.set(TZ1_A, '0xfresh');
    await cache.hydrate();
    expect(cache.get(TZ1_A)).toBe('0xfresh');
  });
});
