import { describe, it, expect } from 'vitest';
import type { AccountSummary, VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import { summaryToView, activeToView } from '../view-account';

describe('summaryToView', () => {
  it('maps a tezos summary (tz1 + alias), seeding the identicon on the tz1', () => {
    const s: AccountSummary = { id: 'a1', kind: 'tezos', label: 'Main', primaryAddress: 'tz1abc', secondaryAddress: '0xalias', createdAt: 10 };
    expect(summaryToView(s)).toEqual({
      id: 'a1', kind: 'tezos', label: 'Main', createdAt: 10,
      tz1: 'tz1abc', evmAlias: '0xalias', identitySeed: 'tz1abc',
    });
  });

  it('maps an evm summary to a single 0x address', () => {
    const s: AccountSummary = { id: 'a2', kind: 'evm', primaryAddress: '0xevm', createdAt: 20 };
    expect(summaryToView(s)).toEqual({
      id: 'a2', kind: 'evm', label: '', createdAt: 20, address: '0xevm', identitySeed: '0xevm',
    });
  });

  it('normalises a blank label to empty', () => {
    const s: AccountSummary = { id: 'a3', kind: 'tezos', label: '   ', primaryAddress: 'tz1x', createdAt: 0 };
    expect(summaryToView(s).label).toBe('');
  });
});

describe('activeToView', () => {
  it('derives a tezos active account from the unlocked state fields (works pre-summaries)', () => {
    const state: VaultStateUnlocked = {
      status: 'unlocked', kind: 'tezos', accountId: 'a1', tz1: 'tz1abc', evmAlias: '0xalias',
      accounts: [{ id: 'a1', kind: 'tezos', label: 'Main', primaryAddress: 'tz1abc', secondaryAddress: '0xalias', createdAt: 10 }],
    };
    expect(activeToView(state)).toMatchObject({
      id: 'a1', kind: 'tezos', label: 'Main', tz1: 'tz1abc', evmAlias: '0xalias', identitySeed: 'tz1abc', createdAt: 10,
    });
  });

  it('derives an evm active account, seeding the identicon on the address', () => {
    const state: VaultStateUnlocked = {
      status: 'unlocked', kind: 'evm', accountId: 'a2', address: '0xevm',
      accounts: [{ id: 'a2', kind: 'evm', primaryAddress: '0xevm', createdAt: 20 }],
    };
    expect(activeToView(state)).toMatchObject({ id: 'a2', kind: 'evm', address: '0xevm', identitySeed: '0xevm' });
  });
});
