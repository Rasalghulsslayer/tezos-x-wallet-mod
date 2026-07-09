/**
 * removeAccount orchestration — the mobile shell has no message dispatch, so
 * vault-actions itself must reproduce what the extension's handler does around
 * the core use-case: evict the removed account's cached container, and, when
 * the active account was removed, re-scope to the auto-selected replacement
 * and re-point connected dApps at it. The keyring/vault rules themselves
 * (password check, last-account guard, active-pointer flip) are covered by
 * the core suites; these tests pin the sequencing only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const keyring = {
    getUnlocked: vi.fn(),
  };
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
    rebindStoredSessions: vi.fn(async () => {}),
  };
});

vi.mock('../../composition/wiring', () => ({
  keyring: h.keyring,
  tokenStore: {},
  unlockSecret: {},
  evmAliasCache: h.evmAliasCache,
  deps: h.deps,
  approvalQueue: h.deps.approvalQueue,
  sessionStore: {},
}));
vi.mock('../../composition/approval-ui', () => ({
  approvalUi: { get: () => null, subscribe: () => () => {} },
}));
vi.mock('../../composition/read-state', () => ({ readState: vi.fn() }));
vi.mock('../../composition/walletconnect-connect', () => ({
  startWalletConnect: vi.fn(),
  connect: vi.fn(),
  rebindStoredSessions: h.rebindStoredSessions,
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: () => [],
  disconnectSession: vi.fn(),
  subscribeSessions: () => () => {},
}));
vi.mock('@tezosx/wallet-core/use-cases/remove-account', () => ({
  removeAccount: h.removeAccountUseCase,
}));
vi.mock('@tezosx/wallet-core/use-cases/get-state', () => ({
  getState: h.getState,
}));

import { removeAccount } from '../vault-actions';

const REMAINING_STATE = {
  status: 'unlocked',
  kind: 'tezos',
  accountId: 'acc-b',
  tz1: 'tz1RemainingAccount',
  evmAlias: '0xAliasOfRemaining',
  accounts: [],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  h.evmAliasCache.value = '0xAliasOfActive';
  h.keyring.getUnlocked.mockReturnValue({ account: { id: 'acc-a' } });
  h.getState.mockResolvedValue(REMAINING_STATE);
});

describe('removeAccount — non-active account', () => {
  it('runs the use-case, evicts the container, and leaves the active scope alone', async () => {
    const state = await removeAccount('acc-x', 'pw');

    expect(h.removeAccountUseCase).toHaveBeenCalledWith(
      { accountId: 'acc-x', password: 'pw' },
      { keyring: h.keyring },
    );
    expect(h.deps.containerCache.evict).toHaveBeenCalledWith('acc-x');
    expect(h.deps.rebuildContainer).not.toHaveBeenCalled();
    expect(h.rebindStoredSessions).not.toHaveBeenCalled();
    expect(h.deps.broadcastEvent).not.toHaveBeenCalled();
    expect(h.evmAliasCache.value).toBe('0xAliasOfActive');
    expect(state).toBe(REMAINING_STATE);
  });
});

describe('removeAccount — active account', () => {
  it('re-scopes to the replacement and re-points connected dApps at it', async () => {
    await removeAccount('acc-a', 'pw');

    expect(h.deps.containerCache.evict).toHaveBeenCalledWith('acc-a');
    expect(h.deps.rebuildContainer).toHaveBeenCalledTimes(1);
    expect(h.rebindStoredSessions).toHaveBeenCalledWith({
      accountId: 'acc-b',
      tz1Address: 'tz1RemainingAccount',
      evmAlias: '0xAliasOfRemaining',
    });
    expect(h.deps.broadcastEvent).toHaveBeenCalledWith({
      type: 'PROVIDER_EVENT',
      event: 'accountsChanged',
      data: ['0xAliasOfRemaining'],
    });
  });

  it('a dApp re-point failure does not fail the removal', async () => {
    h.rebindStoredSessions.mockRejectedValueOnce(new Error('relay down'));
    const state = await removeAccount('acc-a', 'pw');
    expect(state).toBe(REMAINING_STATE);
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
