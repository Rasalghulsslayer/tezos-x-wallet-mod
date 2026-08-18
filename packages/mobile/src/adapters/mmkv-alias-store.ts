/**
 * MmkvAliasStore: persists the tz1 → EVM alias map behind EvmAliasCache in
 * MMKV, one JSON object under a single key. Wallet-global like the contact
 * store — the mapping is an immutable public kernel fact, not key material —
 * so it lives in plain storage and survives app restarts: once resolved, an
 * alias never needs the network again. Mirrors the MmkvContactStore shape
 * against the AliasStore port.
 */

import type { MMKV } from 'react-native-mmkv';
import type { AliasStore } from '@tezosx/wallet-core/ports/alias-store';

const ALIASES_KEY = 'evmAliases';

export class MmkvAliasStore implements AliasStore {
  constructor(private readonly mmkv: MMKV) {}

  async load(): Promise<Record<string, string>> {
    const raw = this.mmkv.getString(ALIASES_KEY);
    if (raw == null) return {};
    // The port contract: corrupt storage yields {} — the cache starts cold
    // and the backfill re-resolves, rather than poisoning every unlock.
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }

  async save(entries: Record<string, string>): Promise<void> {
    this.mmkv.set(ALIASES_KEY, JSON.stringify(entries));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(ALIASES_KEY);
  }
}
