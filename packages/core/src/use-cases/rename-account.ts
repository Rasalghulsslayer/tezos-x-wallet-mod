/**
 * renameAccount: updates an account's label. Empty string clears.
 */

import type { Keyring } from '../background/keyring';
import type { AccountId } from '../domain/account';

export interface RenameAccountReq {
  accountId: AccountId;
  label:     string;
}

export interface RenameAccountDeps {
  keyring: Keyring;
}

export async function renameAccount(req: RenameAccountReq, deps: RenameAccountDeps): Promise<void> {
  await deps.keyring.renameAccount(req.accountId, req.label);
}