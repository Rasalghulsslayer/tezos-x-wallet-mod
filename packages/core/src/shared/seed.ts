import { generateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { InMemorySigner } from '@taquito/signer';

/**
 * BIP44 ed25519 path for the Tezos account at `index` (coin type 1729; every
 * level hardened, as SLIP-10 ed25519 requires). Incrementing the account level
 * is the Temple/Kukai convention for "next account from the same phrase".
 */
export function tezosDerivationPath(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid derivation index');
  return `m/44'/1729'/${index}'/0'`;
}

/** Standard Tezos ed25519 derivation path (BIP44 coin type 1729), index 0. */
export const TEZOS_DERIVATION_PATH = tezosDerivationPath(0);

/** Word count for the primary wallet seed (industry default: 24 words = 256-bit entropy). */
export const MNEMONIC_WORDS = 24;

/** Generate a fresh BIP39 English mnemonic of `MNEMONIC_WORDS` words. */
export function newMnemonic(): string {
  return generateMnemonic(englishWordlist, 256);
}

/** Expose the raw English wordlist (e.g. for autocomplete in the import form). */
export const ENGLISH_WORDLIST = englishWordlist;

/**
 * Three 1-indexed positions (strictly increasing, ~20/50/80% of the phrase)
 * to challenge in the seed-confirmation step. Proportional rather than fixed
 * so the check scales with the phrase: hardcoded positions verify nothing
 * beyond word 11 on 15/18/21/24-word mnemonics. Consumers look words up with
 * `words[position - 1]`.
 */
export function pickConfirmPositions(wordCount: number): [number, number, number] {
  const a = Math.max(1, Math.floor(wordCount * 0.2));
  const b = Math.max(a + 1, Math.floor(wordCount * 0.5));
  const c = Math.max(b + 1, Math.floor(wordCount * 0.8));
  return [a, b, c];
}

/**
 * Derive the tz1 identity (address + public key + encoded secret key) at
 * `index` from a mnemonic. Uses SLIP-10 ed25519 derivation under
 * `tezosDerivationPath(index)`; the default index 0 is the historical
 * single-account path, so existing callers derive unchanged addresses.
 */
export async function deriveTezosIdentity(mnemonic: string, index = 0): Promise<{
  tz1:       string;
  publicKey: string;
  secretKey: string;
}> {
  const signer = InMemorySigner.fromMnemonic({
    mnemonic,
    derivationPath: tezosDerivationPath(index),
    curve:          'ed25519',
  });

  const [tz1, publicKey, secretKey] = await Promise.all([
    signer.publicKeyHash(),
    signer.publicKey(),
    signer.secretKey(),
  ]);

  return { tz1, publicKey, secretKey };
}

/**
 * Build the tz1 identity directly from a Tezos-encoded secret key (edsk...).
 * No derivation path involved — the key *is* the account.
 */
export async function deriveTezosIdentityFromSecretKey(edsk: string): Promise<{
  tz1:       string;
  publicKey: string;
  secretKey: string;
}> {
  const signer = new InMemorySigner(edsk.trim());
  const [tz1, publicKey, secretKey] = await Promise.all([
    signer.publicKeyHash(),
    signer.publicKey(),
    signer.secretKey(),
  ]);
  return { tz1, publicKey, secretKey };
}
