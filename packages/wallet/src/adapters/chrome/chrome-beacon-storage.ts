/**
 * Beacon's `Storage`, backed by `chrome.storage.local` and scoped to the one key
 * being asked for.
 *
 * ── WHY NOT THE SDK'S OWN `ChromeStorage` ────────────────────────────────────
 *
 * `@airgap/beacon-core`'s `ChromeStorage.get` calls
 * `chrome.storage.local.get(null, …)` — it reads the ENTIRE extension namespace
 * and then picks one key out of the result (`dist/esm/storage/ChromeStorage.js:15-31`).
 * This wallet keeps the encrypted vault at `chrome.storage.local['vault']`, plus
 * the per-origin sessions, balance/activity snapshots, tokens and contacts. So
 * every Beacon read — peers, permissions, app metadata, the SDK seed — would pull
 * the vault ciphertext and every snapshot into a content script that runs on
 * every page.
 *
 * It is ciphertext, and the ISOLATED world is not page-readable, so this is not
 * a disclosure. It is still needless exposure and needless I/O on a hot path,
 * and neither has a reason to exist: Beacon only ever wants one key.
 *
 * `delete` also differs deliberately: the SDK's writes `undefined` into the key
 * rather than removing it. This removes it.
 *
 * All keys are Beacon's own `beacon:*` (`StorageKey`), so there is no collision
 * with the wallet's own entries.
 */

import {
  defaultValues,
  type Storage as BeaconStorage,
  type StorageKey,
  type StorageKeyReturnType,
} from '@airgap/beacon-types';

/**
 * The SDK hands the caller its own default for a missing key and then mutates it
 * (peer lists and permission lists are read, pushed to, and written back), so an
 * object default must be a fresh copy per read — sharing one would let two reads
 * accumulate into the same array. Mirrors what `ChromeStorage` does.
 */
function freshDefault<K extends StorageKey>(key: K): StorageKeyReturnType[K] {
  const value = defaultValues[key];
  return (typeof value === 'object' && value !== null
    ? JSON.parse(JSON.stringify(value))
    : value) as StorageKeyReturnType[K];
}

/**
 * Keys whose value is an append-only list fed by page-supplied input. Anything
 * not listed here is written through untouched — the SDK seed, the version
 * marker and the rest are single small values.
 */
const BOUNDED_LISTS = new Set<string>([
  'beacon:postmessage-peers-wallet',
  'beacon:app-metadata-list',
  'beacon:permissions',
]);

/** Most entries to keep in a bounded list. Far above any real dApp count. */
const MAX_LIST_ENTRIES = 25;

/**
 * Total serialized budget per bounded list. Bounds a single oversized entry —
 * an `appMetadata.icon` can be an arbitrarily large data URI, and unlike a
 * pairing record the wallet cannot clamp its fields before the SDK writes it.
 */
const MAX_LIST_BYTES = 64 * 1024;

/** Drop the oldest entries until the list is within both bounds. */
function prune<K extends StorageKey>(
  key:   K,
  value: StorageKeyReturnType[K],
): StorageKeyReturnType[K] {
  if (!BOUNDED_LISTS.has(key) || !Array.isArray(value)) return value;

  // Widened to `unknown[]`: the per-key element types are irrelevant here, and
  // keeping the generic through `slice` costs a cast per step instead of one.
  const original: unknown[] = value;
  let entries: unknown[] =
    original.length > MAX_LIST_ENTRIES ? original.slice(-MAX_LIST_ENTRIES) : original;
  while (entries.length > 0 && JSON.stringify(entries).length > MAX_LIST_BYTES) {
    entries = entries.slice(1);
  }

  const dropped = original.length - entries.length;
  if (dropped > 0) {
    console.warn(
      `[TezosX Wallet] beacon storage pruned ${dropped} ` +
      `entr${dropped === 1 ? 'y' : 'ies'} from ${key}`,
    );
  }
  return entries as StorageKeyReturnType[K];
}

export class ChromeBeaconStorage implements BeaconStorage {
  async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    const stored = await chrome.storage.local.get(key);
    const value = stored[key];
    return value == null ? freshDefault(key) : (value as StorageKeyReturnType[K]);
  }

  /**
   * Write, pruning the growable lists to a bound first.
   *
   * WHY THE BOUND LIVES HERE. Two Beacon lists grow on page-driven input with no
   * user prompt in the way, and one of them the wallet never touches directly:
   *
   *  - `beacon:postmessage-peers-wallet` — `PeerManager.addPeer` dedupes on
   *    `publicKey` ALONE (`beacon-core/dist/esm/managers/PeerManager.js:22-24`),
   *    so a page looping pairing requests with a fresh random key each time
   *    appends forever.
   *  - `beacon:app-metadata-list` — `IncomingRequestInterceptor.handleV2Message`
   *    persists the dApp's SELF-DECLARED `appMetadata` before the interceptor
   *    callback runs, i.e. before the service worker sees the request at all, and
   *    `AppMetadataManager` dedupes on the page-chosen `senderId`. The wallet has
   *    no hook on that write; this adapter is the only chokepoint.
   *
   * They share the 10 MB `chrome.storage.local` namespace with the encrypted
   * vault (`chrome-vault-store.ts`), the extension requests no
   * `unlimitedStorage`, and nothing in the wallet prunes `beacon:*` — RESET_WALLET
   * included. Filling it means the wallet can no longer save its own vault.
   *
   * Pruning rather than refusing: a rejected write would leave the SDK believing
   * it had persisted, and its writes are fire-and-forget in places. Dropping the
   * OLDEST entries keeps every write successful and bounds the total, at the cost
   * of evicting the least recently added pairing — stated in the test diary.
   */
  async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: prune(key, value) });
  }

  async delete<K extends StorageKey>(key: K): Promise<void> {
    // `String(key)` only to satisfy @types/chrome's generic `remove` overload,
    // which cannot infer from a union-typed enum value.
    await chrome.storage.local.remove(String(key));
  }

  /**
   * Not wired up. The SDK uses this to notice another tab changing storage; the
   * shipped `ChromeStorage` leaves it as a `// TODO` no-op too, and nothing on
   * the permission path depends on it. Left as a no-op rather than half-built so
   * it cannot look implemented.
   */
  async subscribeToStorageChanged(): Promise<void> {}

  getPrefixedKey<K extends StorageKey>(key: K): string {
    return key;
  }
}
