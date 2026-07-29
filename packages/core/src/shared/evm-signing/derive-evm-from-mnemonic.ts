/**
 * deriveEvmFromMnemonic: BIP-39 mnemonic → EVM identity at a BIP44 Ethereum
 * path. This is the standard multi-account pattern of EVM wallets: one phrase,
 * accounts at m/44'/60'/0'/0/{index}. Built on @scure/bip39 + @scure/bip32 —
 * the same audited primitives the rest of the signing stack uses.
 */

import { mnemonicToSeed } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { deriveEvmAccount, type EvmIdentity } from './derive-evm-account';
import { bytesToHex } from './bytes';
import { wipe } from '../wipe';

/** Standard Ethereum BIP44 path for the account at `index`. */
export function evmDerivationPath(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid derivation index');
  return `m/44'/60'/0'/0/${index}`;
}

export async function deriveEvmFromMnemonic(mnemonic: string, index = 0): Promise<EvmIdentity> {
  const seed = await mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(evmDerivationPath(index));
  try {
    if (child.privateKey == null) throw new Error('Derivation produced no private key');
    return deriveEvmAccount(bytesToHex(child.privateKey));
  } finally {
    wipe(seed);
    root.wipePrivateData();
    child.wipePrivateData();
  }
}
