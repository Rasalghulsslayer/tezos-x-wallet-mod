import { describe, expect, it } from 'vitest';
import { accountSwitcherVM } from '../account-switcher-vm';
import type { VaultStateUnlocked, AccountSummary } from '@tezosx/wallet-core/shared/messages';

const tezosSummary = (id: string, createdAt: number, label?: string): AccountSummary => ({
  id, kind: 'tezos', label,
  primaryAddress:   `tz1Account${id}EndPad000000000000000000`,
  secondaryAddress: `0xAlias${id}000000000000000000000000000000abcd`,
  createdAt,
});

const evmSummary = (id: string, createdAt: number, label?: string): AccountSummary => ({
  id, kind: 'evm', label,
  primaryAddress: `0xEvm${id}00000000000000000000000000000000abcd`,
  createdAt,
});

const stateWith = (accounts: AccountSummary[], activeId: string): VaultStateUnlocked => ({
  status:    'unlocked',
  kind:      'tezos',
  accountId: activeId,
  tz1:       accounts.find(a => a.id === activeId)?.primaryAddress ?? '',
  evmAlias:  accounts.find(a => a.id === activeId)?.secondaryAddress ?? '',
  accounts,
});

describe('accountSwitcherVM', () => {
  it('single Tezos account → others empty, displayLabel falls back to "Account 1"', () => {
    const state = stateWith([tezosSummary('a', 100)], 'a');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.displayLabel).toBe('Account 1');
    expect(vm.active.isActive).toBe(true);
    expect(vm.others).toHaveLength(0);
  });

  it('two unlabeled accounts get "Account 1" / "Account 2" by createdAt ASC', () => {
    const state = stateWith([tezosSummary('a', 200), tezosSummary('b', 100)], 'a');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.id).toBe('a');
    expect(vm.active.displayLabel).toBe('Account 2');     // a was created second
    expect(vm.others[0].id).toBe('b');
    expect(vm.others[0].displayLabel).toBe('Account 1');  // b was created first
  });

  it('user-provided label wins over fallback', () => {
    const state = stateWith([tezosSummary('a', 100, 'Trading'), evmSummary('b', 200)], 'a');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.displayLabel).toBe('Trading');
    expect(vm.others[0].displayLabel).toBe('Account 2');
  });

  it('Tezos rows carry a truncated secondaryAddress (EVM alias); EVM rows do not', () => {
    const state = stateWith([tezosSummary('a', 100), evmSummary('b', 200)], 'a');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.secondaryAddress).toMatch(/^0x/);
    expect(vm.others[0].secondaryAddress).toBeUndefined();
  });

  it('kindLabel surfaces Michelson / EVM', () => {
    const state = stateWith([tezosSummary('a', 100), evmSummary('b', 200)], 'a');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.kindLabel).toBe('Michelson');
    expect(vm.others[0].kindLabel).toBe('EVM');
  });

  it('active is hoisted to the top regardless of createdAt position', () => {
    const state = stateWith([tezosSummary('a', 100), tezosSummary('b', 200), tezosSummary('c', 300)], 'b');
    const vm    = accountSwitcherVM(state);
    expect(vm.active.id).toBe('b');
    expect(vm.others.map(r => r.id)).toEqual(['a', 'c']);    // others stay in createdAt ASC
  });
});
