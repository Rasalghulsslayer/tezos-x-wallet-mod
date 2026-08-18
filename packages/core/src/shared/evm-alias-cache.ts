/**
 * EvmAliasCache: in-memory tz1 → EVM alias map shared by getState and the
 * shells. The alias is a deterministic, immutable kernel mapping (and only
 * resolvable through the node RPC — there is no local derivation), so entries
 * never expire and the cache survives lock: it holds public chain data, not
 * key material. It dies with the process (MV3 service-worker eviction, app
 * restart) and is cleared on wallet reset.
 *
 * getState reads it synchronously — resolving an alias over the network must
 * never gate the unlock path — and backfill() fills missing entries from the
 * network in the background, single-flight.
 */

export class EvmAliasCache {
  private entries = new Map<string, string>();
  private inflight: Promise<boolean> | null = null;

  get(tz1: string): string | null {
    return this.entries.get(tz1) ?? null;
  }

  set(tz1: string, alias: string): void {
    this.entries.set(tz1, alias);
  }

  clear(): void {
    this.entries.clear();
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
    const missing = tz1s.filter((tz1) => !this.entries.has(tz1));
    if (missing.length === 0) return Promise.resolve(false);
    this.inflight = (async () => {
      let resolved = false;
      await Promise.all(missing.map(async (tz1) => {
        try {
          this.entries.set(tz1, await derive(tz1));
          resolved = true;
        } catch {
          // Offline or RPC down — leave the entry missing; retried on the next kick.
        }
      }));
      return resolved;
    })();
    void this.inflight.finally(() => { this.inflight = null; });
    return this.inflight;
  }
}
