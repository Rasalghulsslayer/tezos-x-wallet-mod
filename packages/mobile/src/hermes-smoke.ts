/**
 * Hermes runtime smoke check — runs the two highest-risk core operations on the
 * React Native engine to confirm the shared core actually works there:
 *   1. Taquito derives a tz1 identity from a mnemonic (the on-device signing path).
 *   2. @noble decrypts a vault sealed by the extension (cross-device crypto).
 *
 * Both avoid any secure-RNG need — the mnemonic is fixed and decrypt uses the
 * salt/iv carried in the vault — so this runs in Expo Go without a native build.
 * The logic is identical to the Node cross-implementation test that already
 * passes; this only confirms it survives the Hermes runtime.
 */

import { deriveTezosIdentity } from '@tezosx/wallet-core/shared/seed';
import { decryptVault } from '@tezosx/wallet-core/shared/vault-crypto';
import type { EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';
import { NobleCryptoPort } from './adapters/noble-crypto-port';

// Canonical BIP-39 12-word test vector (valid checksum) → deterministic tz1.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// A vault sealed off-device (node:crypto, PBKDF2-SHA256 100k + AES-256-GCM,
// ciphertext‖tag, standard base64) — byte-compatible with the core envelope, so
// it stands in for an extension-exported vault. 100k (not the production 600k)
// keeps pure-JS PBKDF2 snappy on a phone.
const EXTENSION_VAULT: EncryptedVault = {
  ciphertext:
    'HLXdtJO3Tm+AsKdAuVAbJ2WAV+pf+GsoaRtdCf4XNAmItFjhc2xIs9TET+2LhVXPckaLliptgT1upCBawm4dD11fP7l9eVp2cjLXHCIwnUHkTWu2EmtlFLAq1PiG6xiIVyAEGrk7qulJn3Phv6Nyi7uwbhp0vuq0nGZ6YCfGuJ/OlQjgfiqFYS4j65RNdWHthnd3nLMLlIkBO7MsHdZQpZ6IdqG56figtnU8MTYsyjnF9Um+YVTp18VAtF8idMROKT5UftAhRtmKQuFBb1WhsALIeXxMf2NzPhXh7Ji+rG2qrWxIemGS+eFiZvbHfpcGK+p+y0w08PuYIN0JccioxiriGAB8+w==',
  iv:         'bzQqGM7TQG3yhIUH',
  salt:       'boVZUmfhy8YRjeh9leJqHQ==',
  iterations: 100_000,
};
const VAULT_PASSWORD = 'test-password';
const EXPECTED_PLAINTEXT =
  '{"version":2,"active":"acct-1","accounts":[{"kind":"tezos","id":"acct-1","tz1":"tz1Test0000000000000000000000000000","publicKey":"edpkTest","createdAt":0}],"secrets":{"acct-1":{"kind":"mnemonic","value":"cross-device vault decrypted on Hermes"}}}';

export interface CheckResult {
  name:   string;
  ok:     boolean;
  detail: string;
}

export async function runHermesChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1 — Taquito on Hermes.
  try {
    const id = await deriveTezosIdentity(TEST_MNEMONIC);
    results.push({
      name:   'Taquito — derive tz1 from mnemonic',
      ok:     id.tz1.startsWith('tz1'),
      detail: id.tz1,
    });
  } catch (e) {
    results.push({ name: 'Taquito — derive tz1 from mnemonic', ok: false, detail: errStr(e) });
  }

  // 2 — @noble decrypts an extension-sealed vault on Hermes.
  try {
    const plaintext = await decryptVault(EXTENSION_VAULT, VAULT_PASSWORD, new NobleCryptoPort());
    const match = plaintext === EXPECTED_PLAINTEXT;
    results.push({
      name:   '@noble — decrypt extension vault (cross-device)',
      ok:     match,
      detail: match ? 'plaintext matches the extension-sealed vault' : `MISMATCH: ${plaintext.slice(0, 48)}…`,
    });
  } catch (e) {
    results.push({ name: '@noble — decrypt extension vault (cross-device)', ok: false, detail: errStr(e) });
  }

  return results;
}

function errStr(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
