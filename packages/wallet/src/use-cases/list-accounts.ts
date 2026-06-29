/**
 * listAccounts: AccountSummary[] for the popup switcher, sorted by createdAt ASC.
 */

import type { Keyring } from '../background/keyring';
import type { AccountSummary } from '@tezosx/wallet-core/domain/account';

export interface ListAccountsDeps {
  keyring: Keyring;
}

export async function listAccounts(deps: ListAccountsDeps): Promise<AccountSummary[]> {
  const summaries = await deps.keyring.listAccountSummaries();
  return summaries.slice().sort((a, b) => a.createdAt - b.createdAt);
}