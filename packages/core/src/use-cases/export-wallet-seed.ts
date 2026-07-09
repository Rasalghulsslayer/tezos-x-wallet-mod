/**
 * exportWalletSeed: re-decrypts the stored vault and returns the wallet-level
 * seed phrase — the phrase every derived account hangs off. Distinct from
 * exportSecret, which returns one account's own signing material.
 */

import type { Keyring } from '../background/keyring';

export interface ExportWalletSeedReq {
  password: string;
}

export interface ExportWalletSeedDeps {
  keyring: Keyring;
}

export async function exportWalletSeed(req: ExportWalletSeedReq, deps: ExportWalletSeedDeps): Promise<string> {
  return deps.keyring.exportWalletSeed(req.password);
}
