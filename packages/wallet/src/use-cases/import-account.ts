/**
 * importAccount: imports an existing identity from either a BIP-39 mnemonic
 * or a Tezos-encoded edsk secret key, then leaves the keyring unlocked.
 */

import type { Keyring } from '../background/keyring';

export type ImportAccountReq =
  | { source: 'mnemonic'; mnemonic: string; password: string }
  | { source: 'edsk';     edsk:     string; password: string };

export interface ImportAccountDeps {
  keyring: Keyring;
}

export async function importAccount(
  req:  ImportAccountReq,
  deps: ImportAccountDeps,
): Promise<void> {
  if (req.source === 'mnemonic') {
    await deps.keyring.importFromMnemonic(req.mnemonic, req.password);
    return;
  }
  await deps.keyring.importFromSecretKey(req.edsk, req.password);
}
