/**
 * Vault payload shape + pure mutation helpers. Keyring is the orchestrator
 * (crypto + persistence + unlock cache); the logic that decides "given this
 * payload and this request, what is the next payload" lives here.
 */

import type { Account, AccountId } from './account';
import { MAX_ACCOUNTS_PER_VAULT, MAX_LABEL_LENGTH } from '../shared/constants';

export type AccountSecret =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string }
  | { kind: 'evm-pk';   value: string };

export interface MultiAccountVaultPayload {
  version:  2;
  accounts: Account[];
  active:   AccountId;
  secrets:  Record<AccountId, AccountSecret>;
}

export class MaxAccountsReachedError extends Error {
  constructor(public readonly cap: number) {
    super(`Vault already holds ${cap} accounts`);
    this.name = 'MaxAccountsReachedError';
  }
}

export class CannotRemoveLastAccountError extends Error {
  constructor() {
    super('Cannot remove the last remaining account');
    this.name = 'CannotRemoveLastAccountError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(public readonly accountId: AccountId) {
    super(`Account ${accountId} not found in vault`);
    this.name = 'AccountNotFoundError';
  }
}

export function addAccountToPayload(
  payload: MultiAccountVaultPayload,
  account: Account,
  secret:  AccountSecret,
): MultiAccountVaultPayload {
  if (payload.accounts.length >= MAX_ACCOUNTS_PER_VAULT) {
    throw new MaxAccountsReachedError(MAX_ACCOUNTS_PER_VAULT);
  }
  return {
    ...payload,
    accounts: [...payload.accounts, account],
    secrets:  { ...payload.secrets, [account.id]: secret },
  };
}

export function removeAccountFromPayload(
  payload:   MultiAccountVaultPayload,
  accountId: AccountId,
): MultiAccountVaultPayload {
  if (payload.accounts.length === 1) throw new CannotRemoveLastAccountError();
  if (payload.accounts.find(a => a.id === accountId) == null) throw new AccountNotFoundError(accountId);

  const remaining = payload.accounts.filter(a => a.id !== accountId);
  const secrets   = { ...payload.secrets };
  delete secrets[accountId];

  const active = payload.active === accountId
    ? [...remaining].sort((a, b) => a.createdAt - b.createdAt)[0].id
    : payload.active;

  return { version: 2, accounts: remaining, active, secrets };
}

export function setActiveOnPayload(
  payload:   MultiAccountVaultPayload,
  accountId: AccountId,
): MultiAccountVaultPayload {
  if (payload.active === accountId) return payload;
  if (payload.accounts.find(a => a.id === accountId) == null) throw new AccountNotFoundError(accountId);
  return { ...payload, active: accountId };
}

export function renameOnPayload(
  payload:   MultiAccountVaultPayload,
  accountId: AccountId,
  label:     string,
): MultiAccountVaultPayload {
  if (label.length > MAX_LABEL_LENGTH) throw new Error(`Label too long (max ${MAX_LABEL_LENGTH})`);
  if (payload.accounts.find(a => a.id === accountId) == null) throw new AccountNotFoundError(accountId);
  const normalised = normaliseLabel(label);
  const accounts: Account[] = payload.accounts.map(a =>
    a.id === accountId ? ({ ...a, label: normalised } as Account) : a,
  );
  return { ...payload, accounts };
}

export function normaliseLabel(label: string | undefined): string | undefined {
  if (label == null) return undefined;
  const trimmed = label.trim();
  return trimmed === '' ? undefined : trimmed;
}
