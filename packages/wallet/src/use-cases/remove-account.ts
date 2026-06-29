/**
 * removeAccount: deletes an account from the unlocked vault after
 * password confirmation. Auto-switches active to the next createdAt-ASC peer
 * if the removed id was active. The SW caller broadcasts accountsChanged
 * and rebuilds the container when that happens.
 */

import type { Keyring } from '../background/keyring';
import type { AccountId } from '@tezosx/wallet-core/domain/account';

export interface RemoveAccountReq {
  accountId: AccountId;
  password:  string;
}

export interface RemoveAccountDeps {
  keyring: Keyring;
}

export async function removeAccount(req: RemoveAccountReq, deps: RemoveAccountDeps): Promise<void> {
  await deps.keyring.removeAccount(req.accountId, req.password);
}