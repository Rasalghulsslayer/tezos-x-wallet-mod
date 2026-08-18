/**
 * The unlock tail must be network-free and failure-proof: once the vault
 * decrypt succeeded the keyring is unlocked in memory, so anything after it
 * that rejects would leave the React view on 'locked' — with auto-lock never
 * armed while signing keys sit reachable. These tests drive the real core
 * seams (unlockVault, getState, EvmAliasCache) through vault-actions with only
 * the platform edges doubled: the alias derivation RPC is mocked to fail like
 * an offline device, and the tests pin that (a) unlock still resolves unlocked
 * with a null alias, (b) a rejecting container warm / Keychain seal cannot
 * fail the unlock, and (c) the alias cache heals on a later kick once the
 * network returns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';

const TZ1   = 'tz1UnlockTailTestAccount';
const ALIAS = '0xAliasOfUnlockTailTestAccount';

const h = vi.hoisted(() => {
  const account = { id: 'acc-1', kind: 'tezos' as const, tz1: 'tz1UnlockTailTestAccount', label: 'Main', createdAt: 1 };
  const keyring = {
    unlock: vi.fn(async () => {}),
    hasVault: vi.fn(async () => true),
    getUnlocked: vi.fn(() => ({ account, payload: { accounts: [account] } })),
    listAccounts: vi.fn(() => [account]),
    listAccountSummaries: vi.fn(() => [
      { id: 'acc-1', kind: 'tezos' as const, label: 'Main', primaryAddress: 'tz1UnlockTailTestAccount', createdAt: 1 },
    ]),
    hasWalletSeed: vi.fn(() => true),
  };
  const unlockSecret = { seal: vi.fn(async () => {}) };
  const tokenStore   = { list: vi.fn(async () => []), upsert: vi.fn(async () => {}) };
  const deps = {
    keyring,
    approvalQueue: { rejectAll: vi.fn() },
    containerCache: { clear: vi.fn(), evict: vi.fn() },
    rebuildContainer: vi.fn(async () => {}),
    broadcastEvent: vi.fn(async () => {}),
    state: { container: null },
    persistentPorts: {},
  };
  return {
    account, keyring, unlockSecret, tokenStore, deps,
    evmAliasCache: null as unknown,
    derive: vi.fn<(tz1: string) => Promise<string>>(),
  };
});

vi.mock('../../composition/wiring', async () => {
  const { EvmAliasCache } = await import('@tezosx/wallet-core/shared/evm-alias-cache');
  h.evmAliasCache = new EvmAliasCache();
  return {
    keyring: h.keyring,
    tokenStore: h.tokenStore,
    unlockSecret: h.unlockSecret,
    evmAliasCache: h.evmAliasCache,
    deps: h.deps,
    approvalQueue: h.deps.approvalQueue,
    sessionStore: {},
  };
});
vi.mock('../../composition/approval-ui', () => ({
  approvalUi: { get: () => null, subscribe: () => () => {} },
}));
vi.mock('../../composition/walletconnect-connect', () => ({
  startWalletConnect: vi.fn(async () => {}),
  connect: vi.fn(),
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: () => [],
  disconnectSession: vi.fn(),
  subscribeSessions: () => () => {},
}));
vi.mock('@tezosx/relayer/utils/derive', () => ({
  deriveEvmAlias: (tz1: string) => h.derive(tz1),
}));

import { unlockWithPassword, kickAliasBackfill, bootState } from '../vault-actions';

// The real EvmAliasCache instance, installed by the wiring mock factory above.
const aliasCache = h.evmAliasCache as EvmAliasCache;

/** Let the fire-and-forget backfill (and its swallowed failure) settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  vi.clearAllMocks();
  await flush();       // drain any backfill left in flight by the previous test
  aliasCache.clear();
});

describe('unlockWithPassword — the offline unlock tail', () => {
  it('resolves unlocked with a null alias when the alias RPC is unreachable', async () => {
    h.derive.mockRejectedValue(new Error('Network request failed'));

    const state = await unlockWithPassword('pw');
    await flush();

    if (state.status !== 'unlocked' || state.kind !== 'tezos') throw new Error('expected an unlocked tezos state');
    expect(state.tz1).toBe(TZ1);
    expect(state.evmAlias).toBeNull();
    // Real summaries and the seed flag flow through — no empty-accounts
    // workaround, no '' alias sentinel.
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].secondaryAddress).toBeUndefined();
    expect(state.hasSeed).toBe(true);
  });

  it('cannot be failed by the post-decrypt tail (seal + container warm rejecting)', async () => {
    // This was the offline bug: a rejecting tail left the React view on
    // 'locked' while the keyring sat unlocked in memory — and auto-lock,
    // armed by the unlocked view, never engaged.
    h.derive.mockRejectedValue(new Error('Network request failed'));
    h.unlockSecret.seal.mockRejectedValueOnce(new Error('keystore refused'));
    h.deps.rebuildContainer.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(unlockWithPassword('pw')).resolves.toMatchObject({ status: 'unlocked' });
    await flush();
  });
});

describe('kickAliasBackfill — the cache heals when the network returns', () => {
  it('retries after a failed backfill and reports through onResolved', async () => {
    h.derive.mockRejectedValue(new Error('Network request failed'));
    await unlockWithPassword('pw');
    await flush();
    expect(aliasCache.get(TZ1)).toBeNull();

    // Still offline: the kick retries (the failure left the entry missing,
    // not poisoned), fails again, and stays silent.
    const notCalled = vi.fn();
    kickAliasBackfill(notCalled);
    await flush();
    expect(notCalled).not.toHaveBeenCalled();

    // Network back: the next kick lands the alias and fires the callback.
    h.derive.mockResolvedValue(ALIAS);
    const onResolved = vi.fn();
    kickAliasBackfill(onResolved);
    await flush();
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(aliasCache.get(TZ1)).toBe(ALIAS);

    // The healed entry reaches the state read: active alias + summary face.
    const state = await bootState();
    if (state.status !== 'unlocked' || state.kind !== 'tezos') throw new Error('expected an unlocked tezos state');
    expect(state.evmAlias).toBe(ALIAS);
    expect(state.accounts[0].secondaryAddress).toBe(ALIAS);
  });

  it('does not re-fire onResolved when every alias is already cached', async () => {
    aliasCache.set(TZ1, ALIAS);
    const onResolved = vi.fn();

    kickAliasBackfill(onResolved);
    await flush();

    expect(h.derive).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
