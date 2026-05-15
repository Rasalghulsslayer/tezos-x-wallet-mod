/**
 * importAccount: imports an existing identity from a BIP-39 mnemonic, a Tezos
 * edsk secret key, or an EVM hex private key, then leaves the keyring
 * unlocked on the new active account.
 */

import type { Keyring } from '../background/keyring';

export type ImportAccountReq =
  | { source: 'mnemonic';    mnemonic:   string; password: string }
  | { source: 'edsk';        edsk:       string; password: string }
  | { source: 'evm-privkey'; privateKey: string; password: string };

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
  if (req.source === 'edsk') {
    await deps.keyring.importFromSecretKey(req.edsk, req.password);
    return;
  }
  await deps.keyring.importFromEvmPrivkey(req.privateKey, req.password);
}
