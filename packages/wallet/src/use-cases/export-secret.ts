/**
 * exportSecret: re-decrypts the stored vault and returns the raw secret
 * (mnemonic / edsk / evm-pk) for user-initiated export. With no accountId,
 * returns the active account's secret; with one, returns that specific
 * account's secret.
 */

import type { Keyring, VaultPayload } from '../background/keyring';
import type { AccountId } from '@tezosx/wallet-core/domain/account';

export interface ExportSecretReq {
  password:   string;
  accountId?: AccountId;
}

export interface ExportSecretDeps {
  keyring: Keyring;
}

export async function exportSecret(req: ExportSecretReq, deps: ExportSecretDeps): Promise<VaultPayload> {
  if (req.accountId == null) return deps.keyring.exportSecret(req.password);
  return deps.keyring.exportSecretFor(req.accountId, req.password);
}
