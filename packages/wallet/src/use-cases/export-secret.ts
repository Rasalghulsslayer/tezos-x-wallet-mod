/**
 * exportSecret: re-decrypts the stored vault and returns the raw secret
 * (mnemonic or edsk) for user-initiated export.
 */

import type { Keyring, VaultPayload } from '../background/keyring';

export interface ExportSecretReq {
  password: string;
}

export interface ExportSecretDeps {
  keyring: Keyring;
}

export async function exportSecret(
  req:  ExportSecretReq,
  deps: ExportSecretDeps,
): Promise<VaultPayload> {
  return deps.keyring.exportSecret(req.password);
}
