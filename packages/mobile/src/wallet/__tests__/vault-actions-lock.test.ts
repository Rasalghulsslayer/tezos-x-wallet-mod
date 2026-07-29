/**
 * lockWallet — the mobile shell runs on one long-lived JS thread, so nothing
 * evicts cached Containers (live signers holding plaintext key material) for
 * us the way MV3 service-worker death does for the extension. Locking must
 * therefore drop every reference to a Container synchronously: the container
 * cache, the warm active-container slot, and the alias caches. These tests pin
 * that contract with a real ContainerCache and a fake Container standing in
 * for a signer that holds key material.
 *
 * Honest limit: JS strings cannot be zeroized in place, so "no key material
 * referenced" means unreachable-then-GC'd, not overwritten. The keyring's own
 * derived-key wipe is covered by the core suites; what this file proves is
 * that the mobile shell leaves no path back to a signer once lockWallet
 * returns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import type { Container } from '@tezosx/wallet-core/ports/container';

const h = vi.hoisted(() => {
  const keyring = { lock: vi.fn(), getUnlocked: vi.fn() };
  const approvalQueue = { rejectAll: vi.fn() };
  const deps = {
    keyring,
    approvalQueue,
    containerCache: null as unknown, // a real ContainerCache, injected per test
    rebuildContainer: vi.fn(async () => {}),
    broadcastEvent: vi.fn(async () => {}),
    state: { container: null as Container | null, evmAlias: null as string | null },
    persistentPorts: {},
  };
  return { keyring, approvalQueue, deps, evmAliasCache: { value: null as string | null } };
});

vi.mock('../../composition/wiring', () => ({
  keyring: h.keyring,
  tokenStore: {},
  unlockSecret: {},
  evmAliasCache: h.evmAliasCache,
  deps: h.deps,
  approvalQueue: h.approvalQueue,
  sessionStore: {},
}));
vi.mock('../../composition/approval-ui', () => ({
  approvalUi: { get: () => null, subscribe: () => () => {} },
}));
vi.mock('../../composition/read-state', () => ({ readState: vi.fn() }));
vi.mock('../../composition/walletconnect-connect', () => ({
  startWalletConnect: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: () => [],
  disconnectSession: vi.fn(),
  subscribeSessions: () => () => {},
}));

import { lockWallet, resolveTx } from '../vault-actions';

/** Stands in for a wired Container: the signer field is the key-material holder. */
function fakeContainer(secret: string): Container {
  return { signer: { kind: 'tezos', secret } } as unknown as Container;
}

describe('lockWallet', () => {
  let cache: ContainerCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new ContainerCache();
    cache.put('acc-a', fakeContainer('edsk-a'));
    cache.put('acc-b', fakeContainer('edsk-b'));
    h.deps.containerCache = cache;
    h.deps.state.container = fakeContainer('edsk-a');
    h.deps.state.evmAlias = '0xSomeAlias';
    h.evmAliasCache.value = '0xSomeAlias';
  });

  it('locks the keyring and flushes pending approvals', () => {
    lockWallet();

    expect(h.keyring.lock).toHaveBeenCalledTimes(1);
    expect(h.approvalQueue.rejectAll).toHaveBeenCalledTimes(1);
  });

  it('leaves no path back to a signer once it returns — synchronously', () => {
    expect(cache.size()).toBe(2);
    expect(h.deps.state.container).not.toBeNull();

    lockWallet();

    // Every composition-level reference a caller could follow to a signer is
    // gone before lockWallet returns: the cache no longer resolves any
    // account, the warm container slot and both alias caches are nulled.
    expect(cache.size()).toBe(0);
    expect(cache.get('acc-a')).toBeUndefined();
    expect(cache.get('acc-b')).toBeUndefined();
    expect(h.deps.state.container).toBeNull();
    expect(h.deps.state.evmAlias).toBeNull();
    expect(h.evmAliasCache.value).toBeNull();
  });

  it('drops the warm container in the same tick, not on a scheduled rebuild', () => {
    lockWallet();

    // A scheduled rebuild would null the slot only on a later microtask,
    // leaving a window where a caller still reaches the dead container.
    expect(h.deps.rebuildContainer).not.toHaveBeenCalled();
  });

  it('cuts the consumer path: resolveTx refuses to run after lock', () => {
    lockWallet();

    expect(() => resolveTx('0xdeadbeef')).toThrow('Wallet is locked');
  });

  it('is idempotent — a background lock racing the idle timer is harmless', () => {
    lockWallet();
    expect(() => lockWallet()).not.toThrow();
    expect(h.deps.state.container).toBeNull();
  });
});
