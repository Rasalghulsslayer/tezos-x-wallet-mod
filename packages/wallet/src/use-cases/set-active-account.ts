/**
 * setActiveAccount: flips the persisted active account. The SW caller is
 * responsible for rebuilding the container and broadcasting accountsChanged.
 */

import type { Keyring } from '../background/keyring';
import type { AccountId } from '@tezosx/wallet-core/domain/account';

export interface SetActiveAccountReq {
  accountId: AccountId;
}

export interface SetActiveAccountDeps {
  keyring: Keyring;
}

export async function setActiveAccount(req: SetActiveAccountReq, deps: SetActiveAccountDeps): Promise<void> {
  await deps.keyring.setActiveAccount(req.accountId);
}