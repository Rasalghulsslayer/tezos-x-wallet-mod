/**
 * AliasStore: persistence for the tz1 → EVM alias map behind EvmAliasCache.
 * Wallet-global like the ContactStore — the mapping is an immutable, public
 * kernel fact, not key material, so it lives in plain platform storage
 * (chrome.storage.local / MMKV) and survives process death: once resolved, an
 * alias never needs the network again. Cleared on wallet reset because the
 * map enumerates the vault's tz1 addresses.
 */

export interface AliasStore {
  /** The full persisted map. Missing/corrupt storage yields {}. */
  load(): Promise<Record<string, string>>;
  /** Replace the persisted map with `entries` (write-through from the cache). */
  save(entries: Record<string, string>): Promise<void>;
  clear(): Promise<void>;
}
