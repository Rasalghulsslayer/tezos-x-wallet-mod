import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { InMemorySigner } from '@taquito/signer';

/** Standard Tezos ed25519 derivation path (BIP44 coin type 1729). */
export const TEZOS_DERIVATION_PATH = "m/44'/1729'/0'/0'";

/** Word count for the primary wallet seed (industry default: 24 words = 256-bit entropy). */
export const MNEMONIC_WORDS = 24;

/** Generate a fresh BIP39 English mnemonic of `MNEMONIC_WORDS` words. */
export function newMnemonic(): string {
  return generateMnemonic(englishWordlist, 256);
}

/** Validate a user-provided mnemonic against the English wordlist. */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), englishWordlist);
}

/** Expose the raw English wordlist (e.g. for autocomplete in the import form). */
export const ENGLISH_WORDLIST = englishWordlist;

/**
 * Derive the tz1 identity (address + public key + encoded secret key) from a
 * mnemonic. Uses SLIP-10 ed25519 derivation under `TEZOS_DERIVATION_PATH`.
 */
export async function deriveTezosIdentity(mnemonic: string): Promise<{
  tz1:       string;
  publicKey: string;
  secretKey: string;
}> {
  const signer = InMemorySigner.fromMnemonic({
    mnemonic,
    derivationPath: TEZOS_DERIVATION_PATH,
    curve:          'ed25519',
  });

  const [tz1, publicKey, secretKey] = await Promise.all([
    signer.publicKeyHash(),
    signer.publicKey(),
    signer.secretKey(),
  ]);

  return { tz1, publicKey, secretKey };
}

/** Guard used by the UI mnemonic autocomplete. */
export function isValidBip39Word(word: string): boolean {
  return (englishWordlist as readonly string[]).includes(word.toLowerCase());
}
