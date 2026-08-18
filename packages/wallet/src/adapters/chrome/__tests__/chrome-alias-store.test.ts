/**
 * ChromeAliasStore pins the 'evmAliases' storage key (the boot-time hydrate in
 * the service worker and the e2e pre-inject both address it) and the port's
 * corrupt-storage contract: load() must yield {} rather than throw, so the
 * alias cache starts cold and the backfill re-resolves.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeAliasStore } from '../chrome-alias-store';

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

const MAP = { tz1abc: '0x' + 'ab'.repeat(20) };

describe('ChromeAliasStore', () => {
  let raw: Map<string, unknown>;
  beforeEach(() => { raw = stubChromeStorage(); });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips the whole map under the evmAliases key', async () => {
    const store = new ChromeAliasStore();
    await store.save(MAP);
    expect(raw.get('evmAliases')).toEqual(MAP);
    expect(await store.load()).toEqual(MAP);
  });

  it('yields {} for missing or corrupt storage', async () => {
    const store = new ChromeAliasStore();
    expect(await store.load()).toEqual({});
    raw.set('evmAliases', 'not-a-map');
    expect(await store.load()).toEqual({});
    raw.set('evmAliases', ['not', 'a', 'map']);
    expect(await store.load()).toEqual({});
  });

  it('clear removes the key', async () => {
    const store = new ChromeAliasStore();
    await store.save(MAP);
    await store.clear();
    expect(raw.has('evmAliases')).toBe(false);
    expect(await store.load()).toEqual({});
  });
});
