/**
 * getState must be network-free: an offline unlock (empty alias cache, no way
 * to derive) still resolves an unlocked state, with `evmAlias: null` and
 * summaries lacking `secondaryAddress` until the background backfill lands.
 */

import { describe, expect, it } from 'vitest';
import { getState } from '../get-state';
import { EvmAliasCache } from '../../shared/evm-alias-cache';
import type { Keyring } from '../../background/keyring';
import type { Account, AccountSummary } from '../../domain/account';

const TZ1   = 'tz1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ALIAS = '0x00000000000000000000000000000000000000aa';

interface KeyringStub {
  hasVault:             () => Promise<boolean>;
  getUnlocked:          () => { account: Account } | null;
  listAccountSummaries: () => AccountSummary[];
  hasWalletSeed:        () => boolean;
}

function stubKeyring(overrides: Partial<KeyringStub> = {}): Keyring {
  const base: KeyringStub = {
    hasVault:    async () => true,
    getUnlocked: () => ({
      account: { kind: 'tezos', id: 'id-1', tz1: TZ1, publicKey: 'edpk...', createdAt: 1 },
    }),
    listAccountSummaries: () => [
      { id: 'id-1', kind: 'tezos', primaryAddress: TZ1, createdAt: 1 },
    ],
    hasWalletSeed: () => true,
  };
  return { ...base, ...overrides } as unknown as Keyring;
}

describe('getState — network-free', () => {
  it('resolves an unlocked tezos state with evmAlias null when the cache is cold', async () => {
    const state = await getState({ keyring: stubKeyring(), aliasCache: new EvmAliasCache() });
    expect(state).toMatchObject({ status: 'unlocked', kind: 'tezos', tz1: TZ1, evmAlias: null });
    if (state.status !== 'unlocked' || state.kind !== 'tezos') throw new Error('unreachable');
    expect(state.accounts[0].secondaryAddress).toBeUndefined();
  });

  it('decorates the active alias and summaries from the cache when warm', async () => {
    const aliasCache = new EvmAliasCache();
    aliasCache.set(TZ1, ALIAS);
    const state = await getState({ keyring: stubKeyring(), aliasCache });
    if (state.status !== 'unlocked' || state.kind !== 'tezos') throw new Error('expected unlocked tezos');
    expect(state.evmAlias).toBe(ALIAS);
    expect(state.accounts[0].secondaryAddress).toBe(ALIAS);
  });

  it('leaves EVM accounts untouched by the alias cache', async () => {
    const keyring = stubKeyring({
      getUnlocked: () => ({
        account: { kind: 'evm', id: 'id-2', address: '0x00000000000000000000000000000000000000bb', publicKey: '0x04', createdAt: 2 },
      }),
      listAccountSummaries: () => [
        { id: 'id-2', kind: 'evm', primaryAddress: '0x00000000000000000000000000000000000000bb', createdAt: 2 },
      ],
    });
    const state = await getState({ keyring, aliasCache: new EvmAliasCache() });
    expect(state).toMatchObject({ status: 'unlocked', kind: 'evm' });
  });

  it('sorts summaries by createdAt ascending', async () => {
    const keyring = stubKeyring({
      listAccountSummaries: () => [
        { id: 'newer', kind: 'tezos', primaryAddress: TZ1, createdAt: 9 },
        { id: 'older', kind: 'tezos', primaryAddress: TZ1, createdAt: 1 },
      ],
    });
    const state = await getState({ keyring, aliasCache: new EvmAliasCache() });
    if (state.status !== 'unlocked') throw new Error('expected unlocked');
    expect(state.accounts.map((a) => a.id)).toEqual(['older', 'newer']);
  });

  it('reports locked / empty without touching summaries', async () => {
    expect(await getState({ keyring: stubKeyring({ getUnlocked: () => null }), aliasCache: new EvmAliasCache() }))
      .toEqual({ status: 'locked' });
    expect(await getState({ keyring: stubKeyring({ hasVault: async () => false }), aliasCache: new EvmAliasCache() }))
      .toEqual({ status: 'empty' });
  });
});
