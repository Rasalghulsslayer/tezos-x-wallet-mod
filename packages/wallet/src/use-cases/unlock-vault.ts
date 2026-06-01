/**
 * unlockVault: decrypts the stored vault and loads the active account into
 * the keyring's in-memory state.
 */

import type { Keyring } from '../background/keyring';

export interface UnlockVaultReq {
  password: string;
}

export interface UnlockVaultDeps {
  keyring: Keyring;
}

export async function unlockVault(req: UnlockVaultReq, deps: UnlockVaultDeps): Promise<void> {
  await deps.keyring.unlock(req.password);
}
