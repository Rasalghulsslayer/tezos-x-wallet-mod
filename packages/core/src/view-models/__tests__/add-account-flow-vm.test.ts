import { describe, expect, it } from 'vitest';
import { addAccountFlowVM, addAccountStages } from '../add-account-flow-vm';

describe('addAccountFlowVM', () => {
  it('derived path is two steps; other paths are four', () => {
    expect(addAccountStages('derived')).toEqual(['choose', 'confirm']);
    expect(addAccountStages('fresh')).toEqual(['choose', 'runtime', 'input', 'confirm']);
    expect(addAccountStages('import')).toEqual(['choose', 'runtime', 'input', 'confirm']);
  });

  it('the choose screen carries no step math (it is the router)', () => {
    const vm = addAccountFlowVM('choose', null);
    expect(vm.kicker).toBeNull();
    expect(vm.dots).toBeNull();
    expect(vm.index).toBe(0);
  });

  it('derived confirm reads Step 2 of 2 with matching dots', () => {
    const vm = addAccountFlowVM('confirm', { kind: 'tezos', source: 'derived' });
    expect(vm.kicker).toBe('Step 2 of 2 · Review');
    expect(vm.dots).toEqual({ i: 1, n: 2 });
  });

  it('kickers and dots always agree on the 4-step paths', () => {
    const runtime = addAccountFlowVM('runtime', { kind: 'evm', source: 'import' });
    expect(runtime.kicker).toBe('Step 2 of 4 · Choose runtime');
    expect(runtime.dots).toEqual({ i: 1, n: 4 });

    const confirm = addAccountFlowVM('confirm', { kind: 'evm', source: 'import' });
    expect(confirm.kicker).toBe('Step 4 of 4 · Review');
    expect(confirm.dots).toEqual({ i: 3, n: 4 });
  });

  it('input labels follow the source and kind', () => {
    expect(addAccountFlowVM('input', { kind: 'tezos', source: 'fresh' }).kicker)
      .toBe('Step 3 of 4 · Save your phrase');
    expect(addAccountFlowVM('input', { kind: 'evm', source: 'fresh' }).kicker)
      .toBe('Step 3 of 4 · Save your key');
    expect(addAccountFlowVM('input', { kind: 'tezos', source: 'import' }).kicker)
      .toBe('Step 3 of 4 · Paste a secret');
  });
});
