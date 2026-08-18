/**
 * EvmAliasCache: tz1 → EVM alias map shared by getState and the shells. The
 * alias is a deterministic, immutable kernel mapping (and only resolvable
 * through the node RPC — there is no local derivation), so entries never
 * expire and the cache survives lock: it holds public chain data, not key
 * material. It is cleared on wallet reset.
 *
 * getState reads it synchronously — resolving an alias over the network must
 * never gate the unlock path — and backfill() fills missing entries from the
 * network in the background, single-flight. With an AliasStore attached,
 * every resolved entry is written through to platform storage and hydrate()
 * restores the map after process death (MV3 eviction, app restart), so an
 * alias is resolved at most once per tz1 per wallet lifetime.
 */

import type { AliasStore } from '../ports/alias-store';

export class EvmAliasCache {
  private entries = new Map<string, string>();
  private inflight: Promise<boolean> | null = null;
  private hydrated: Promise<void> | null = null;

  constructor(private readonly store?: AliasStore) {}

  /**
   * Merge the persisted map into memory. Idempotent and single-flight; a
   * storage failure resolves silently (the cache just starts cold and the
   * backfill re-resolves). In-memory entries win over persisted ones — they
   * are at least as fresh.
   */
  hydrate(): Promise<void> {
    if (this.store == null) return Promise.resolve();
    this.hydrated ??= this.store.load()
      .then((persisted) => {
        for (const [tz1, alias] of Object.entries(persisted)) {
          if (!this.entries.has(tz1)) this.entries.set(tz1, alias);
        }
      })
      .catch(() => { /* cold start; backfill re-resolves */ });
    return this.hydrated;
  }

  get(tz1: string): string | null {
    return this.entries.get(tz1) ?? null;
  }

  set(tz1: string, alias: string): void {
    this.entries.set(tz1, alias);
    this.persist();
  }

  /** Drop one entry (account removal hygiene — the map enumerates tz1s). */
  remove(tz1: string): void {
    if (this.entries.delete(tz1)) this.persist();
  }

  clear(): void {
    this.entries.clear();
    if (this.store != null) void this.store.clear().catch(() => { /* best-effort */ });
  }

  /**
   * Resolve every missing entry via `derive`, single-flight: concurrent calls
   * share the in-flight run instead of stacking RPCs. Individual failures are
   * swallowed — the entry stays missing and the next kick retries — so an
   * offline unlock costs nothing and heals itself when the network returns.
   * Resolves true when at least one new alias landed.
   */
  backfill(tz1s: string[], derive: (tz1: string) => Promise<string>): Promise<boolean> {
    if (this.inflight != null) return this.inflight;
    const run = async (): Promise<boolean> => {
      await this.hydrate();
      const missing = tz1s.filter((tz1) => !this.entries.has(tz1));
      if (missing.length === 0) return false;
      let resolved = false;
      await Promise.all(missing.map(async (tz1) => {
        try {
          this.entries.set(tz1, await derive(tz1));
          resolved = true;
        } catch {
          // Offline or RPC down — leave the entry missing; retried on the next kick.
        }
      }));
      if (resolved) this.persist();
      return resolved;
    };
    this.inflight = run();
    void this.inflight.finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private persist(): void {
    if (this.store == null) return;
    void this.store.save(Object.fromEntries(this.entries)).catch(() => { /* re-written on the next set */ });
  }
}
