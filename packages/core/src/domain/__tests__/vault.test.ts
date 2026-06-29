import { describe, expect, it } from 'vitest';
import type { Account, TezosAccount } from '../account';
import {
  type MultiAccountVaultPayload,
  type AccountSecret,
  CannotRemoveLastAccountError,
  AccountNotFoundError,
  MaxAccountsReachedError,
  addAccountToPayload,
  removeAccountFromPayload,
  setActiveOnPayload,
  renameOnPayload,
} from '../vault';
import { MAX_ACCOUNTS_PER_VAULT, MAX_LABEL_LENGTH } from '../../shared/constants';

const tz1Acc = (id: string, createdAt: number, label?: string): TezosAccount => ({
  kind: 'tezos', id, label, tz1: `tz1${id}`, publicKey: `edpk${id}`, createdAt,
});

const tz1Sec: AccountSecret = { kind: 'mnemonic', value: 'mnem-placeholder' };

const payloadOf = (...accounts: Account[]): MultiAccountVaultPayload => ({
  version:  2,
  accounts,
  active:   accounts[0].id,
  secrets:  Object.fromEntries(accounts.map(a => [a.id, tz1Sec])),
});

describe('addAccountToPayload', () => {
  it('appends an account without flipping active', () => {
    const before = payloadOf(tz1Acc('a', 1));
    const next   = addAccountToPayload(before, tz1Acc('b', 2), tz1Sec);
    expect(next.accounts.map(a => a.id)).toEqual(['a', 'b']);
    expect(next.active).toBe('a');
    expect(next.secrets.b).toEqual(tz1Sec);
  });

  it('throws MaxAccountsReachedError at the cap', () => {
    const accounts = Array.from({ length: MAX_ACCOUNTS_PER_VAULT }, (_, i) => tz1Acc(`a${i}`, i));
    const payload  = payloadOf(...accounts);
    expect(() => addAccountToPayload(payload, tz1Acc('over', 99), tz1Sec)).toThrow(MaxAccountsReachedError);
  });
});

describe('removeAccountFromPayload', () => {
  it('removes a non-active account; active unchanged', () => {
    const payload = payloadOf(tz1Acc('a', 1), tz1Acc('b', 2));
    const next    = removeAccountFromPayload(payload, 'b');
    expect(next.accounts.map(a => a.id)).toEqual(['a']);
    expect(next.active).toBe('a');
    expect(next.secrets).not.toHaveProperty('b');
  });

  it('removes the active account; active flips to oldest remaining peer (createdAt ASC)', () => {
    const payload = { ...payloadOf(tz1Acc('a', 3), tz1Acc('b', 1), tz1Acc('c', 2)), active: 'a' };
    const next    = removeAccountFromPayload(payload, 'a');
    expect(next.accounts.map(a => a.id)).toEqual(['b', 'c']);
    expect(next.active).toBe('b');
  });

  it('throws CannotRemoveLastAccountError on the last account', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    expect(() => removeAccountFromPayload(payload, 'a')).toThrow(CannotRemoveLastAccountError);
  });

  it('throws AccountNotFoundError for an unknown id', () => {
    const payload = payloadOf(tz1Acc('a', 1), tz1Acc('b', 2));
    expect(() => removeAccountFromPayload(payload, 'nope')).toThrow(AccountNotFoundError);
  });
});

describe('setActiveOnPayload', () => {
  it('flips the active id', () => {
    const payload = payloadOf(tz1Acc('a', 1), tz1Acc('b', 2));
    const next    = setActiveOnPayload(payload, 'b');
    expect(next.active).toBe('b');
  });

  it('returns the same reference when setting to the existing active (no-op)', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    const next    = setActiveOnPayload(payload, 'a');
    expect(next).toBe(payload);
  });

  it('throws AccountNotFoundError for an unknown id', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    expect(() => setActiveOnPayload(payload, 'nope')).toThrow(AccountNotFoundError);
  });
});

describe('renameOnPayload', () => {
  it('sets a label', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    const next    = renameOnPayload(payload, 'a', 'Trading');
    expect(next.accounts[0].label).toBe('Trading');
  });

  it('clears the label when given an empty string', () => {
    const payload = payloadOf(tz1Acc('a', 1, 'Trading'));
    const next    = renameOnPayload(payload, 'a', '');
    expect(next.accounts[0].label).toBeUndefined();
  });

  it('throws when label exceeds MAX_LABEL_LENGTH', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    const long    = 'x'.repeat(MAX_LABEL_LENGTH + 1);
    expect(() => renameOnPayload(payload, 'a', long)).toThrow(/Label too long/);
  });

  it('throws AccountNotFoundError for an unknown id', () => {
    const payload = payloadOf(tz1Acc('a', 1));
    expect(() => renameOnPayload(payload, 'nope', 'x')).toThrow(AccountNotFoundError);
  });
});
