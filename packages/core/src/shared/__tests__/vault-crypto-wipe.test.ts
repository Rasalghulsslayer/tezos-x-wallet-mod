/**
 * Zeroization contract of the vault envelope: the PBKDF2-derived AES key and
 * the plaintext bytes are overwritten once sealVault / decryptVault are done
 * with them, while the envelope/plaintext the caller receives stays correct.
 * A stub CryptoPort keeps references to the buffers so the test can observe
 * them after the call.
 */

import { describe, expect, it } from 'vitest';
import { sealVault, decryptVault, PBKDF2_ITERATIONS } from '../vault-crypto';
import type { CryptoPort } from '../../ports/crypto-port';

function isZeroed(b: Uint8Array): boolean {
  return b.every((x) => x === 0);
}

/** XOR "encryption" — enough to observe buffer lifecycles round-trip. */
function makeSpyPort() {
  const seen: { keys: Uint8Array[]; plaintexts: Uint8Array[] } = { keys: [], plaintexts: [] };
  const port: CryptoPort = {
    randomBytes: (n) => new Uint8Array(n).fill(7),
    randomUUID: () => '00000000-0000-4000-8000-000000000000',
    async pbkdf2Sha256(_pw, _salt, _iter, len) {
      const key = new Uint8Array(len).fill(42);
      seen.keys.push(key);
      return key;
    },
    async aesGcmEncrypt(key, _iv, plaintext) {
      const out = plaintext.map((b, i) => b ^ key[i % key.length]);
      return out;
    },
    async aesGcmDecrypt(key, _iv, ciphertext) {
      const out = ciphertext.map((b, i) => b ^ key[i % key.length]);
      seen.plaintexts.push(out);
      return out;
    },
  };
  return { port, seen };
}

describe('vault-crypto zeroization', () => {
  it('sealVault zeroizes the derived key after producing a correct envelope', async () => {
    const { port, seen } = makeSpyPort();
    const vault = await sealVault('secret payload', 'pw', port, new Uint8Array(16), new Uint8Array(12), PBKDF2_ITERATIONS);

    expect(vault.ciphertext.length).toBeGreaterThan(0);
    expect(seen.keys).toHaveLength(1);
    expect(isZeroed(seen.keys[0])).toBe(true);
  });

  it('decryptVault returns the plaintext string and zeroizes key + plaintext bytes', async () => {
    const { port, seen } = makeSpyPort();
    const vault = await sealVault('secret payload', 'pw', port, new Uint8Array(16), new Uint8Array(12), PBKDF2_ITERATIONS);

    const out = await decryptVault(vault, 'pw', port);

    expect(out).toBe('secret payload');
    expect(seen.keys).toHaveLength(2);
    expect(isZeroed(seen.keys[1])).toBe(true);
    expect(seen.plaintexts).toHaveLength(1);
    expect(isZeroed(seen.plaintexts[0])).toBe(true);
  });

  it('decryptVault zeroizes the key even when authentication fails', async () => {
    const { seen } = makeSpyPort();
    const failing: CryptoPort = {
      randomBytes: (n) => new Uint8Array(n),
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
      async pbkdf2Sha256(_pw, _salt, _iter, len) {
        const key = new Uint8Array(len).fill(42);
        seen.keys.push(key);
        return key;
      },
      async aesGcmEncrypt() { throw new Error('unused'); },
      async aesGcmDecrypt() { throw new Error('bad decrypt'); },
    };

    await expect(
      decryptVault({ ciphertext: 'AA==', iv: 'AA==', salt: 'AA==', iterations: 1 }, 'pw', failing),
    ).rejects.toThrow('bad decrypt');
    expect(isZeroed(seen.keys[0])).toBe(true);
  });
});
