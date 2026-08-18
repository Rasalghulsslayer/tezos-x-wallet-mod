/**
 * listAccounts: AccountSummary[] for the popup switcher, sorted by createdAt ASC.
 */

import type { Keyring } from '../background/keyring';
import type { AccountSummary } from '../domain/account';

export interface ListAccountsDeps {
  keyring: Keyring;
}

export async function listAccounts(deps: ListAccountsDeps): Promise<AccountSummary[]> {
  return deps.keyring.listAccountSummaries().sort((a, b) => a.createdAt - b.createdAt);
}