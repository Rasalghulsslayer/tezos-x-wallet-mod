/**
 * Cross-implementation vault test vectors.
 *
 * The #1 mobile-port risk is that a vault encrypted on one runtime fails to
 * decrypt on another. This suite pins that down: for fixed inputs, the
 * Web Crypto port (extension), the @noble port (mobile/Hermes), and Node's
 * built-in `node:crypto` must all produce a byte-identical envelope — three
 * independent PBKDF2 + AES-256-GCM backends agreeing, so drift in any single
 * one is caught, not merely disagreement between two. It also proves a vault
 * sealed by one port opens with another, which is the actual cross-device
 * guarantee.
 */

import { describe, it, expect } from 'vitest';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import { WebCryptoPort } from '../web-crypto-port';
import { NobleCryptoPort } from '../noble-crypto-port';
import {
  sealVault,
  encryptVault,
  decryptVault,
  bytesToBase64,
  base64ToBytes,
} from '../../../shared/vault-crypto';
import type { EncryptedVault } from '../../../ports/vault-store';

const PASSWORD  = 'correct-horse-battery-staple';
const PLAINTEXT = JSON.stringify({
  version:  2,
  active:   'acct-1',
  accounts: [{ kind: 'tezos', id: 'acct-1', tz1: 'tz1abc', publicKey: 'edpkxyz', createdAt: 0 }],
  secrets:  { 'acct-1': { kind: 'mnemonic', value: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong' } },
});

// Deterministic salt/iv so the three backends can be compared byte for byte.
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const IV   = Uint8Array.from({ length: 12 }, (_, i) => ((i + 1) * 7) & 0xff);

const web   = new WebCryptoPort();
const noble = new NobleCryptoPort();

// Third, independent reference. Node's GCM exposes the tag separately; Web
// Crypto's convention is ciphertext‖tag, which is what the envelope expects.
function nodeSeal(iterations: number): EncryptedVault {
  const key    = pbkdf2Sync(Buffer.from(PASSWORD, 'utf8'), Buffer.from(SALT), iterations, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(IV));
  const body   = Buffer.concat([cipher.update(Buffer.from(PLAINTEXT, 'utf8')), cipher.final()]);
  const ctAndTag = new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
  return { ciphertext: bytesToBase64(ctAndTag), iv: bytesToBase64(IV), salt: bytesToBase64(SALT), iterations };
}

describe('vault crypto — cross-implementation byte identity', () => {
  it('WebCrypto, @noble and Node produce an identical envelope', async () => {
    const iterations = 4096; // low factor keeps the bulk assertions fast
    const webVault   = await sealVault(PLAINTEXT, PASSWORD, web, SALT, IV, iterations);
    const nobleVault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, iterations);
    const nodeVault  = nodeSeal(iterations);

    expect(webVault).toEqual(nodeVault);
    expect(nobleVault).toEqual(nodeVault);
  });

  it('agreement holds at the production 600k work factor', async () => {
    const iterations = 600_000;
    const webVault   = await sealVault(PLAINTEXT, PASSWORD, web, SALT, IV, iterations);
    const nobleVault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, iterations);

    expect(nobleVault).toEqual(webVault);
    expect(nobleVault.iterations).toBe(600_000);
  }, 30_000);

  it('a vault sealed with WebCrypto opens with @noble and vice versa', async () => {
    const webVault   = await encryptVault(PLAINTEXT, PASSWORD, web);   // random salt/iv, 600k
    const nobleVault = await encryptVault(PLAINTEXT, PASSWORD, noble);

    expect(await decryptVault(webVault, PASSWORD, noble)).toBe(PLAINTEXT);
    expect(await decryptVault(nobleVault, PASSWORD, web)).toBe(PLAINTEXT);
  }, 30_000);

  it('@noble rejects a tampered ciphertext (GCM authentication)', async () => {
    const vault = await sealVault(PLAINTEXT, PASSWORD, web, SALT, IV, 4096);
    const bytes = base64ToBytes(vault.ciphertext);
    bytes[0] ^= 0xff; // flip a byte → the GCM tag no longer matches
    const tampered = { ...vault, ciphertext: bytesToBase64(bytes) };

    await expect(decryptVault(tampered, PASSWORD, noble)).rejects.toThrow();
  });

  it('the wrong password fails to open a @noble-sealed vault', async () => {
    const vault = await sealVault(PLAINTEXT, PASSWORD, noble, SALT, IV, 4096);
    await expect(decryptVault(vault, 'not-the-password', web)).rejects.toThrow();
  });
});

describe('vault crypto — base64 framing (pure, no btoa/atob)', () => {
  it('round-trips arbitrary byte lengths including padding boundaries', () => {
    for (const len of [0, 1, 2, 3, 16, 31, 32, 33, 100, 255]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 31 + 7) & 0xff);
      expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    }
  });

  it('matches Node Buffer base64 for a known payload', () => {
    const bytes = Uint8Array.from({ length: 48 }, (_, i) => (i * 17 + 3) & 0xff);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
