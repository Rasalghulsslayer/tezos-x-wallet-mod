/**
 * The Beacon storage adapter — the wallet's only chokepoint on two lists that
 * grow on page-driven input.
 *
 * Both properties under test are security properties, not conveniences:
 *
 *  - READS ARE KEY-SCOPED. The SDK's own `ChromeStorage.get` calls
 *    `chrome.storage.local.get(null)`, pulling the ENTIRE extension namespace —
 *    including the encrypted vault at `chrome.storage.local['vault']` — into a
 *    content script that runs on every page, on every Beacon read.
 *  - THE GROWABLE LISTS ARE BOUNDED. `PeerManager.addPeer` dedupes on
 *    `publicKey` alone, and `IncomingRequestInterceptor` persists a dApp's
 *    self-declared `appMetadata` before the service worker ever sees the request.
 *    Both share the 10 MB namespace the vault lives in, and nothing else in the
 *    wallet prunes `beacon:*`.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { StorageKey, defaultValues } from '@airgap/beacon-types';
import { ChromeBeaconStorage } from '../chrome-beacon-storage';

interface FakeChrome {
  store: Record<string, unknown>;
  getCalls: unknown[];
  removed: string[];
}

function stubChrome(initial: Record<string, unknown> = {}): FakeChrome {
  const state: FakeChrome = { store: { ...initial }, getCalls: [], removed: [] };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        async get(keys: unknown) {
          state.getCalls.push(keys);
          if (keys == null) return { ...state.store };
          const key = String(keys);
          return key in state.store ? { [key]: state.store[key] } : {};
        },
        async set(items: Record<string, unknown>) { Object.assign(state.store, items); },
        async remove(key: string) { state.removed.push(key); delete state.store[key]; },
      },
    },
  });
  return state;
}

describe('ChromeBeaconStorage', () => {
  let fake: FakeChrome;
  let storage: ChromeBeaconStorage;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake = stubChrome({ vault: { ciphertext: 'the-encrypted-vault' } });
    storage = new ChromeBeaconStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('reads are scoped to one key', () => {
    it('never asks for the whole namespace', async () => {
      await storage.get(StorageKey.BEACON_SDK_SECRET_SEED);
      // `get(null)` is what the SDK's own ChromeStorage does, and what would drag
      // the encrypted vault into a content script on every Beacon read.
      expect(fake.getCalls).toEqual([StorageKey.BEACON_SDK_SECRET_SEED]);
      expect(fake.getCalls).not.toContain(null);
    });

    it('returns the stored value when present', async () => {
      await storage.set(StorageKey.BEACON_SDK_SECRET_SEED, 'the-seed');
      expect(await storage.get(StorageKey.BEACON_SDK_SECRET_SEED)).toBe('the-seed');
    });

    it("returns the SDK's default for a missing key", async () => {
      expect(await storage.get(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET)).toEqual([]);
      expect(await storage.get(StorageKey.BEACON_SDK_SECRET_SEED)).toBeUndefined();
    });

    it('hands out a FRESH default array each time', async () => {
      // The SDK reads a list, pushes to it, and writes it back. A shared default
      // would let two reads accumulate into the same array.
      const a = await storage.get(StorageKey.PERMISSION_LIST);
      a.push({ accountIdentifier: 'x' } as never);
      const b = await storage.get(StorageKey.PERMISSION_LIST);
      expect(b).toEqual([]);
      expect(defaultValues[StorageKey.PERMISSION_LIST]).toEqual([]);
    });

    it('leaves the wallet\'s own entries alone', async () => {
      await storage.set(StorageKey.APP_METADATA_LIST, [{ senderId: 's', name: 'n' }]);
      expect(fake.store.vault).toEqual({ ciphertext: 'the-encrypted-vault' });
    });
  });

  describe('delete removes rather than writing undefined', () => {
    it('calls remove', async () => {
      await storage.set(StorageKey.BEACON_SDK_SECRET_SEED, 'the-seed');
      await storage.delete(StorageKey.BEACON_SDK_SECRET_SEED);
      expect(fake.removed).toEqual([StorageKey.BEACON_SDK_SECRET_SEED]);
      expect(StorageKey.BEACON_SDK_SECRET_SEED in fake.store).toBe(false);
    });
  });

  describe('growable lists are bounded', () => {
    const peer = (i: number) => ({
      type: 'postmessage-pairing-request', id: `id-${i}`, name: `dApp ${i}`,
      publicKey: i.toString(16).padStart(64, '0'), version: '3', senderId: `s-${i}`,
    });

    it('caps the peer list by entry count, keeping the most recent', async () => {
      const peers = Array.from({ length: 200 }, (_, i) => peer(i));
      await storage.set(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET, peers as never);

      const stored = fake.store[StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET] as unknown[];
      expect(stored.length).toBe(25);
      // Oldest dropped, newest kept — a fresh pairing must not be evicted by the
      // flood that preceded it.
      expect((stored.at(-1) as { id: string }).id).toBe('id-199');
    });

    it('caps app metadata, which the SDK writes before the wallet sees the request', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({ senderId: `s-${i}`, name: `app ${i}` }));
      await storage.set(StorageKey.APP_METADATA_LIST, entries as never);
      expect((fake.store[StorageKey.APP_METADATA_LIST] as unknown[]).length).toBe(25);
    });

    it('caps by total bytes too, so one oversized entry cannot fill the namespace', async () => {
      // An appMetadata `icon` is an arbitrarily large page-supplied data URI, and
      // unlike a pairing record the wallet cannot clamp its fields first.
      const huge = Array.from({ length: 5 }, (_, i) => ({
        senderId: `s-${i}`, name: 'x'.repeat(40_000),
      }));
      await storage.set(StorageKey.APP_METADATA_LIST, huge as never);

      const stored = fake.store[StorageKey.APP_METADATA_LIST] as unknown[];
      expect(JSON.stringify(stored).length).toBeLessThanOrEqual(64 * 1024);
      expect(stored.length).toBeLessThan(5);
    });

    it('writes an in-bounds list through untouched', async () => {
      const peers = [peer(1), peer(2), peer(3)];
      await storage.set(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET, peers as never);
      expect(fake.store[StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET]).toEqual(peers);
    });

    it('never prunes a key that is not a growable list', async () => {
      // The seed is a single string; a bound would corrupt it.
      const seed = 'x'.repeat(200_000);
      await storage.set(StorageKey.BEACON_SDK_SECRET_SEED, seed);
      expect(fake.store[StorageKey.BEACON_SDK_SECRET_SEED]).toBe(seed);
    });

    it('always completes the write rather than refusing it', async () => {
      // Pruning, not rejecting: a rejected write would leave the SDK believing it
      // had persisted, and some of its writes are fire-and-forget.
      await expect(
        storage.set(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET,
          Array.from({ length: 500 }, (_, i) => peer(i)) as never),
      ).resolves.toBeUndefined();
      expect(fake.store[StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET]).toBeDefined();
    });
  });
});
