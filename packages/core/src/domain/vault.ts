/**
 * Vault payload shape + pure mutation helpers. Keyring is the orchestrator
 * (crypto + persistence + unlock cache); the logic that decides "given this
 * payload and this request, what is the next payload" lives here.
 */

import type { Account, AccountId, AccountKind } from './account';
import { MAX_ACCOUNTS_PER_VAULT, MAX_LABEL_LENGTH } from '../shared/constants';

export type AccountSecret =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string }
  | { kind: 'evm-pk';   value: string }
  // Resolved against the wallet-level seed at this HD index; the curve comes
  // from the account's kind. Keeping this as a secret kind preserves the
  // invariant that every account has a `secrets[id]` entry.
  | { kind: 'derived';  index: number };

/** What reveal/export flows hand the user: always concrete signing material —
 *  a `derived` marker is resolved before it leaves the keyring. */
export type RevealedSecret = Exclude<AccountSecret, { kind: 'derived' }>;

export interface MultiAccountVaultPayload {
  version:  3;
  /** Wallet-level BIP-39 phrase behind `derived` secrets. Written only by
   *  onboarding (the user demonstrably holds that phrase); vaults migrated
   *  from v2 have none, because the provenance of a v2 account's mnemonic is
   *  unknowable and silently promoting one would change export semantics. */
  seed?:    { mnemonic: string };
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

export class NoWalletSeedError extends Error {
  constructor() {
    super('This wallet has no seed phrase to derive from');
    this.name = 'NoWalletSeedError';
  }
}

export class DuplicateAccountError extends Error {
  constructor(public readonly address: string) {
    super(`An account with address ${address} already exists in the vault`);
    this.name = 'DuplicateAccountError';
  }
}

/**
 * Next unused HD index for `kind`. Gaps left by removed accounts are not
 * reused — re-deriving an interior index would resurrect an address the user
 * deliberately removed. Removing the highest index and re-adding derives the
 * same address again, which is standard HD-wallet behavior: a derived account
 * is always recoverable from the phrase, so funds can never be orphaned.
 */
export function nextDerivationIndex(payload: MultiAccountVaultPayload, kind: AccountKind): number {
  let next = 0;
  for (const a of payload.accounts) {
    if (a.kind !== kind) continue;
    const secret = payload.secrets[a.id];
    if (secret?.kind === 'derived' && secret.index >= next) next = secret.index + 1;
  }
  return next;
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

  return { ...payload, accounts: remaining, active, secrets };
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
