/**
 * ChromeAliasStore: AliasStore backed by chrome.storage.local under the single
 * wallet-global 'evmAliases' key. Like the contact store, one fixed key is
 * enough: the tz1 → EVM alias map is small (one entry per Tezos account) and
 * always read/written whole by EvmAliasCache, so there is no per-account
 * keying and no key index.
 */

import type { AliasStore } from '@tezosx/wallet-core/ports/alias-store';

const KEY = 'evmAliases';

export class ChromeAliasStore implements AliasStore {
  async load(): Promise<Record<string, string>> {
    const data = await chrome.storage.local.get(KEY);
    const map = data[KEY];
    // The port contract: missing/corrupt storage yields {} — the cache just
    // starts cold and the background backfill re-resolves.
    if (typeof map !== 'object' || map == null || Array.isArray(map)) return {};
    return map as Record<string, string>;
  }

  async save(entries: Record<string, string>): Promise<void> {
    await chrome.storage.local.set({ [KEY]: entries });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(KEY);
  }
}
