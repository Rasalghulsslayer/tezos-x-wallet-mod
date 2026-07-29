/**
 * QuickCryptoPort byte-compatibility guard.
 *
 * The native module (react-native-quick-crypto, Nitro/JSI over OpenSSL) cannot
 * load in Vitest's `node` environment, so we cannot exercise the adapter class
 * directly here. Instead we pin the RECIPE the adapter mirrors: react-native-
 * quick-crypto is a node:crypto drop-in, so a `nodeSeal` built from node:crypto
 * (pbkdf2Sync + createCipheriv('aes-256-gcm') + ciphertext‖getAuthTag) must be
 * byte-identical to the shipping @noble port — and, transitively (via the
 * extension's own cross-impl suite that also checks Web Crypto), to the vault
 * the Chrome extension seals. If this holds, a QuickCryptoPort that performs the
 * same node:crypto calls produces the same bytes, so a vault stays portable
 * across runtimes.
 *
 * The mandatory de-risker Vitest cannot cover — sealing on-device with the real
 * native module and opening on the extension (and vice versa) at the production
 * 600k work factor — is tracked as a manual test-script step in CHANGELOG.md.
 */

import { describe, it, expect } from 'vitest';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import { NobleCryptoPort } from '../noble-crypto-port';
import {
  sealVault,
  encryptVault,
  decryptVault,
  bytesToBase64,
  base64ToBytes,
} from '@tezosx/wallet-core/shared/vault-crypto';
import type { EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';

const PASSWORD  = 'correct-horse-battery-staple';
const PLAINTEXT = JSON.stringify({
  version:  2,
  active:   'acct-1',
  accounts: [{ kind: 'tezos', id: 'acct-1', tz1: 'tz1abc', publicKey: 'edpkxyz', createdAt: 0 }],
  secrets:  { 'acct-1': { kind: 'mnemonic', value: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong' } },
});

// Deterministic salt/iv so the two backends compare byte for byte.
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const IV   = Uint8Array.from({ length: 12 }, (_, i) => ((i + 1) * 7) & 0xff);

const noble = new NobleCryptoPort();

/**
 * The exact recipe QuickCryptoPort runs, expressed with node:crypto (which
 * react-native-quick-crypto re-implements natively). Node's GCM exposes the tag
 * separately; the envelope wants ciphertext‖tag, so we append getAuthTag — the
 * same concat the adapter's aesGcmEncrypt does. No AAD, default 16-byte tag.
 */
function nodeSeal(iterations: number): EncryptedVault {
  const key    = pbkdf2Sync(Buffer.from(PASSWORD, 'utf8'), Buffer.from(SALT), iterations, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(IV));
  const body   = Buffer.concat([cipher.update(Buffer.from(PLAINTEXT, 'utf8')), cipher.final()]);
  const ctAndTag = new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
  return { ciphertext: bytesToBase64(ctAndTag), iv: bytesToBase64(IV), salt: bytesToBase64(SALT), iterations };
}

describe('QuickCryptoPort recipe — byte identity with the shipping @noble port', () => {
  it('the node:crypto recipe equals @noble at a low work factor', async () => {
    const iterations = 4096; // fast bulk assertion
    const nobleVault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, iterations);
    expect(nobleVault).toEqual(nodeSeal(iterations));
  });

  it('agreement holds at the production 600k work factor', async () => {
    const iterations = 600_000;
    const nobleVault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, iterations);
    expect(nobleVault).toEqual(nodeSeal(iterations));
    expect(nobleVault.iterations).toBe(600_000);
  }, 30_000);

  it('a node:crypto-sealed vault opens with @noble (cross-runtime openability)', async () => {
    const nodeVault = nodeSeal(4096);
    expect(await decryptVault(nodeVault, PASSWORD, noble)).toBe(PLAINTEXT);
  });
});

describe('QuickCryptoPort recipe — fail-closed integrity (GCM authentication)', () => {
  it('rejects a tampered ciphertext', async () => {
    const vault = await encryptVault(PLAINTEXT, PASSWORD, noble);
    const bytes = base64ToBytes(vault.ciphertext);
    bytes[0] ^= 0xff; // flip a byte → the GCM tag no longer matches
    const tampered = { ...vault, ciphertext: bytesToBase64(bytes) };
    await expect(decryptVault(tampered, PASSWORD, noble)).rejects.toThrow();
  }, 30_000);

  it('rejects the wrong password', async () => {
    const vault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, 4096);
    await expect(decryptVault(vault, 'not-the-password', noble)).rejects.toThrow();
  });
});
