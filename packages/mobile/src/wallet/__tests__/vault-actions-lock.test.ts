/**
 * lockWallet — the mobile shell runs on one long-lived JS thread, so nothing
 * evicts cached Containers (live signers holding plaintext key material) for
 * us the way MV3 service-worker death does for the extension. Locking must
 * therefore clear the container cache explicitly, alongside the keyring lock
 * and the approval flush. This pins that sequence with a real ContainerCache.
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
    state: { container: null, evmAlias: null },
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
  rebindStoredSessions: vi.fn(),
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: () => [],
  disconnectSession: vi.fn(),
  subscribeSessions: () => () => {},
}));

import { lockWallet } from '../vault-actions';

describe('lockWallet', () => {
  let cache: ContainerCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new ContainerCache();
    cache.put('acc-a', {} as Container);
    cache.put('acc-b', {} as Container);
    h.deps.containerCache = cache;
    h.evmAliasCache.value = '0xSomeAlias';
  });

  it('locks the keyring, flushes approvals, and drops every cached container', () => {
    expect(cache.size()).toBe(2);

    lockWallet();

    expect(h.keyring.lock).toHaveBeenCalledTimes(1);
    expect(h.approvalQueue.rejectAll).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
    expect(h.evmAliasCache.value).toBeNull();
    expect(h.deps.rebuildContainer).toHaveBeenCalledTimes(1);
  });
});
