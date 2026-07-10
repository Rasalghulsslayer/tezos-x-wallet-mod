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

const h = vi.hoisted(() => {
  const keyring = { getUnlocked: vi.fn() };
  const deps = {
    keyring,
    containerCache: { evict: vi.fn(), clear: vi.fn() },
    rebuildContainer: vi.fn(async () => {}),
    broadcastEvent: vi.fn(async () => {}),
    state: { container: null, evmAlias: null },
    approvalQueue: { rejectAll: vi.fn() },
    persistentPorts: {},
  };
  return {
    keyring,
    deps,
    evmAliasCache: { value: null as string | null },
    removeAccountUseCase: vi.fn(async () => {}),
    getState: vi.fn(),
    sessionList: vi.fn(async () => [] as { origin: string; accountId?: string }[]),
    disconnectSession: vi.fn(async () => {}),
    listWcSessions: vi.fn(() => [] as { url: string; topic: string }[]),
    disconnectOrigin: vi.fn(async () => {}),
  };
});

vi.mock('../../composition/wiring', () => ({
  keyring: h.keyring,
  tokenStore: {},
  unlockSecret: {},
  evmAliasCache: h.evmAliasCache,
  deps: h.deps,
  approvalQueue: h.deps.approvalQueue,
  sessionStore: { list: h.sessionList, remove: vi.fn() },
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
  listSessions: h.listWcSessions,
  disconnectSession: h.disconnectSession,
  subscribeSessions: () => () => {},
}));
vi.mock('@tezosx/wallet-core/use-cases/remove-account', () => ({ removeAccount: h.removeAccountUseCase }));
vi.mock('@tezosx/wallet-core/use-cases/get-state', () => ({ getState: h.getState }));
vi.mock('@tezosx/wallet-core/use-cases/disconnect-origin', () => ({ disconnectOrigin: h.disconnectOrigin }));

import { removeAccount } from '../vault-actions';

const REMAINING_STATE = {
  status: 'unlocked', kind: 'tezos', accountId: 'acc-b',
  tz1: 'tz1RemainingAccount', evmAlias: '0xAliasOfRemaining', accounts: [],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  h.evmAliasCache.value = '0xAliasOfActive';
  h.keyring.getUnlocked.mockReturnValue({ account: { id: 'acc-a' } });
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
    expect(h.evmAliasCache.value).toBe('0xAliasOfActive');
    expect(state).toBe(REMAINING_STATE);
  });
});

describe('removeAccount — active account', () => {
  it('re-scopes to the replacement without touching other dApps', async () => {
    await removeAccount('acc-a', 'pw');
    expect(h.deps.containerCache.evict).toHaveBeenCalledWith('acc-a');
    expect(h.deps.rebuildContainer).toHaveBeenCalledTimes(1);
    expect(h.evmAliasCache.value).toBeNull();
    // No global accountsChanged broadcast (that was the SEC-1 leak).
    expect(h.deps.broadcastEvent).not.toHaveBeenCalled();
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
  it('wrong password: nothing is evicted and the error surfaces', async () => {
    h.removeAccountUseCase.mockRejectedValueOnce(new Error('Incorrect password'));
    await expect(removeAccount('acc-x', 'bad')).rejects.toThrow('Incorrect password');
    expect(h.deps.containerCache.evict).not.toHaveBeenCalled();
  });

  it('last account: the guard error surfaces', async () => {
    h.removeAccountUseCase.mockRejectedValueOnce(new Error('Cannot remove the last account'));
    await expect(removeAccount('acc-a', 'pw')).rejects.toThrow('Cannot remove the last account');
    expect(h.deps.rebuildContainer).not.toHaveBeenCalled();
  });
});
