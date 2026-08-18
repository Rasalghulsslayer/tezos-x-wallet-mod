/**
 * removeAccount orchestration — the mobile shell has no message dispatch, so
 * vault-actions reproduces what the extension's handler does around the core
 * use-case: evict the removed account's cached container, tear down the dApp
 * sessions that were bound to it (WalletConnect session_delete notifies each
 * dApp), and re-scope when the active account was removed. dApps connected
 * with a *different* account must be left untouched — a removal must not
 * disclose or re-point another origin's account (SEC-1). The keyring/vault
 * rules themselves are covered by the core suites; these tests pin the
 * sequencing only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';

const h = vi.hoisted(() => {
  const keyring = { getUnlocked: vi.fn(), listAccounts: vi.fn(() => [] as { id: string; kind: string; tz1?: string }[]) };
  const snapshotStore = { clear: vi.fn(async () => {}), clearAccount: vi.fn(async () => {}) };
  const deps = {
    keyring,
    containerCache: { evict: vi.fn(), clear: vi.fn() },
    rebuildContainer: vi.fn(async () => {}),
    broadcastEvent: vi.fn(async () => {}),
    state: { container: null },
    approvalQueue: { rejectAll: vi.fn() },
    persistentPorts: { snapshotStore },
  };
  return {
    keyring,
    snapshotStore,
    deps,
    evmAliasCache: null as unknown,
    removeAccountUseCase: vi.fn(async () => {}),
    getState: vi.fn(),
    sessionList: vi.fn(async () => [] as { origin: string; accountId?: string }[]),
    disconnectSession: vi.fn(async () => {}),
    listWcSessions: vi.fn(() => [] as { url: string; topic: string }[]),
    disconnectOrigin: vi.fn(async () => {}),
  };
});

vi.mock('../../composition/wiring', async () => {
  const { EvmAliasCache } = await import('@tezosx/wallet-core/shared/evm-alias-cache');
  h.evmAliasCache = new EvmAliasCache();
  return {
    keyring: h.keyring,
    tokenStore: {},
    unlockSecret: {},
    evmAliasCache: h.evmAliasCache,
    deps: h.deps,
    approvalQueue: h.deps.approvalQueue,
    sessionStore: { list: h.sessionList, remove: vi.fn() },
  };
});
vi.mock('../../composition/approval-ui', () => ({
  approvalUi: { get: () => null, subscribe: () => () => {} },
}));
vi.mock('../../composition/walletconnect-connect', () => ({
  startWalletConnect: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: h.listWcSessions,
  disconnectSession: h.disconnectSession,
  subscribeSessions: () => () => {},
}));
vi.mock('@tezosx/wallet-core/use-cases/remove-account', () => ({ removeAccount: h.removeAccountUseCase }));
vi.mock('@tezosx/wallet-core/use-cases/get-state', () => ({ getState: h.getState }));
vi.mock('@tezosx/wallet-core/use-cases/disconnect-origin', () => ({ disconnectOrigin: h.disconnectOrigin }));

import { removeAccount } from '../vault-actions';

// The real EvmAliasCache instance, installed by the wiring mock factory above.
const aliasCache = h.evmAliasCache as EvmAliasCache;

const REMAINING_STATE = {
  status: 'unlocked', kind: 'tezos', accountId: 'acc-b',
  tz1: 'tz1RemainingAccount', evmAlias: '0xAliasOfRemaining', accounts: [],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  aliasCache.clear();
  aliasCache.set('tz1ActiveAccount', '0xAliasOfActive');
  aliasCache.set('tz1RemainingAccount', '0xAliasOfRemaining');
  h.keyring.getUnlocked.mockReturnValue({ account: { id: 'acc-a' } });
  h.keyring.listAccounts.mockReturnValue([
    { id: 'acc-a', kind: 'tezos', tz1: 'tz1ActiveAccount' },
    { id: 'acc-b', kind: 'tezos', tz1: 'tz1RemainingAccount' },
  ]);
  h.getState.mockResolvedValue(REMAINING_STATE);
  h.sessionList.mockResolvedValue([]);
  h.listWcSessions.mockReturnValue([]);
});

describe('removeAccount — non-active account', () => {
  it('runs the use-case, evicts the container, and leaves the active scope alone', async () => {
    const state = await removeAccount('acc-x', 'pw');
    expect(h.removeAccountUseCase).toHaveBeenCalledWith({ accountId: 'acc-x', password: 'pw' }, { keyring: h.keyring });
    expect(h.deps.containerCache.evict).toHaveBeenCalledWith('acc-x');
    expect(h.deps.rebuildContainer).not.toHaveBeenCalled();
    expect(h.deps.broadcastEvent).not.toHaveBeenCalled();
    expect(state).toBe(REMAINING_STATE);
  });
});

describe('removeAccount — active account', () => {
  it('re-scopes to the replacement without touching other dApps', async () => {
    await removeAccount('acc-a', 'pw');
    expect(h.deps.containerCache.evict).toHaveBeenCalledWith('acc-a');
    expect(h.deps.rebuildContainer).toHaveBeenCalledTimes(1);
    // No global accountsChanged broadcast (that was the SEC-1 leak).
    expect(h.deps.broadcastEvent).not.toHaveBeenCalled();
  });

  it('drops only the removed account\'s alias entry — the others stay valid', async () => {
    // The alias map enumerates the vault's tz1s: the removed account's entry
    // must not outlive it, while the remaining accounts' entries (keyed by
    // their own tz1) are untouched.
    await removeAccount('acc-a', 'pw');
    expect(aliasCache.get('tz1ActiveAccount')).toBeNull();
    expect(aliasCache.get('tz1RemainingAccount')).toBe('0xAliasOfRemaining');
  });

  it('drops the removed account\'s snapshots', async () => {
    await removeAccount('acc-a', 'pw');
    expect(h.snapshotStore.clearAccount).toHaveBeenCalledWith('acc-a');
    expect(h.snapshotStore.clear).not.toHaveBeenCalled();
  });
});

describe('removeAccount — dApp sessions bound to the removed account', () => {
  it('tears down only the removed account\'s sessions, leaving others connected', async () => {
    h.sessionList.mockResolvedValue([
      { origin: 'https://dapp-a.example', accountId: 'acc-a' },   // bound to removed
      { origin: 'https://dapp-b.example', accountId: 'acc-b' },   // bound to another account
    ]);
    h.listWcSessions.mockReturnValue([
      { url: 'https://dapp-a.example', topic: 'topic-a' },
    ]);

    await removeAccount('acc-a', 'pw');

    // The removed account's dApp is disconnected (WC teardown + stored removal
    // via disconnectOrigin); the other dApp is left alone.
    expect(h.disconnectSession).toHaveBeenCalledWith('topic-a');
    expect(h.disconnectOrigin).toHaveBeenCalledWith({ origin: 'https://dapp-a.example' }, expect.anything());
    expect(h.disconnectOrigin).not.toHaveBeenCalledWith({ origin: 'https://dapp-b.example' }, expect.anything());
  });
});

describe('removeAccount — vault rejections propagate untouched', () => {
  it('wrong password: nothing is evicted or dropped and the error surfaces', async () => {
    h.removeAccountUseCase.mockRejectedValueOnce(new Error('Incorrect password'));
    await expect(removeAccount('acc-a', 'bad')).rejects.toThrow('Incorrect password');
    expect(h.deps.containerCache.evict).not.toHaveBeenCalled();
    expect(h.snapshotStore.clearAccount).not.toHaveBeenCalled();
    expect(aliasCache.get('tz1ActiveAccount')).toBe('0xAliasOfActive');
  });

  it('last account: the guard error surfaces', async () => {
    h.removeAccountUseCase.mockRejectedValueOnce(new Error('Cannot remove the last account'));
    await expect(removeAccount('acc-a', 'pw')).rejects.toThrow('Cannot remove the last account');
    expect(h.deps.rebuildContainer).not.toHaveBeenCalled();
  });
});
