/**
 * QuickCryptoPort: the mobile shell's CryptoPort backed by native crypto
 * (react-native-quick-crypto — OpenSSL/BoringSSL over Nitro/JSI). It replaces
 * the pure-JS NobleCryptoPort so the vault's 600k-PBKDF2 derive runs natively
 * (unlock in the sub-second range) instead of grinding the Hermes JS thread for
 * seconds.
 *
 * Byte-for-byte compatibility with the extension's Web Crypto vault is the whole
 * point, and it is not incidental: react-native-quick-crypto is a node:crypto
 * drop-in, and `shared/vault-crypto-cross-impl` (in the extension) already
 * proves node:crypto ≡ @noble ≡ Web Crypto at 4096 and 600k iterations. This
 * adapter therefore mirrors that node:crypto reference exactly:
 *   - AES-256-GCM output is ciphertext‖16-byte-tag (Cipher.getAuthTag appended),
 *     and decrypt splits the trailing 16 bytes back off before setAuthTag.
 *   - NO additional authenticated data (no setAAD) and the default 16-byte tag
 *     length is kept. Adding either would diverge the envelope from the other
 *     runtimes and make existing vaults un-openable — do not change them.
 * See src/adapters/__tests__/quick-crypto-port-byte-compat.test.ts, which pins
 * the same recipe against node:crypto so drift is caught in CI even though the
 * native module itself cannot load under Vitest.
 */

import { pbkdf2, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'react-native-quick-crypto';
import type { CryptoPort } from '@tezosx/wallet-core/ports/crypto-port';

const GCM_TAG_BYTES = 16;

/** Concatenate byte chunks into a fresh plain Uint8Array (the native calls
 *  return Node Buffers; we hand the port plain Uint8Arrays). */
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export class QuickCryptoPort implements CryptoPort {
  randomBytes(length: number): Uint8Array {
    // Native CSPRNG (OpenSSL/BoringSSL) — stronger than, and independent of, the
    // react-native-get-random-values polyfill the @noble port relied on.
    return new Uint8Array(randomBytes(length));
  }

  randomUUID(): string {
    // Native RFC 4122 v4, used only for non-secret account ids.
    return randomUUID();
  }

  pbkdf2Sha256(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array> {
    // Async form on purpose: at 600k iterations the sync form would block the JS
    // thread for the whole derive (the very stall we are removing). The native
    // layer runs it off-thread and calls back. digest MUST be 'sha256' and the
    // password is passed as the JS string — node:crypto UTF-8-encodes it exactly
    // as the @noble port's TextEncoder did (proven by the cross-impl test).
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, iterations, keyLengthBytes, 'sha256', (err, key) => {
        if (err != null || key == null) {
          reject(err ?? new Error('pbkdf2 derivation returned no key'));
          return;
        }
        resolve(new Uint8Array(key));
      });
    });
  }

  async aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body  = new Uint8Array(cipher.update(plaintext));
    const final = new Uint8Array(cipher.final());
    const tag   = new Uint8Array(cipher.getAuthTag()); // 16 bytes (default), appended → ct‖tag
    return concatBytes(body, final, tag);
  }

  async aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array> {
    const cut        = ciphertextAndTag.length - GCM_TAG_BYTES;
    const ciphertext = ciphertextAndTag.subarray(0, cut);
    const tag        = ciphertextAndTag.subarray(cut);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    // setAuthTag is typed to Buffer (update/createDecipheriv accept any BinaryLike
    // Uint8Array); the native layer coerces the tag, so cast the 16-byte slice to
    // the method's own parameter type to bridge the Buffer/Uint8Array gap — no copy.
    decipher.setAuthTag(tag as unknown as Parameters<typeof decipher.setAuthTag>[0]);
    const body  = new Uint8Array(decipher.update(ciphertext));
    // final() authenticates: a wrong password or tampered ciphertext throws here
    // (native EVP), which is how decryptVault surfaces "wrong password".
    const final = new Uint8Array(decipher.final());
    return concatBytes(body, final);
  }
}
