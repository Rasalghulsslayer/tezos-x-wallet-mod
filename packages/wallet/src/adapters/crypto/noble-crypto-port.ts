/**
 * NobleCryptoPort: CryptoPort backed by @noble, for runtimes without Web Crypto.
 *
 * Hermes (React Native) ships no `crypto.subtle` and no `crypto.randomUUID`, so
 * PBKDF2 and AES-GCM come from `@noble/hashes` / `@noble/ciphers` and the UUID
 * is assembled from random bytes. Secure randomness is still expected from the
 * platform's `crypto.getRandomValues` — on RN that is the
 * `react-native-get-random-values` polyfill; in Node and the browser it is
 * native. The vault envelope (base64/UTF-8 framing, work factor) is shared with
 * the Web Crypto path, so output is byte-identical and vaults are portable.
 */

import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes';
import type { CryptoPort } from '@tezosx/wallet-core/ports/crypto-port';

export class NobleCryptoPort implements CryptoPort {
  randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  randomUUID(): string {
    const b = this.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 1 (10xx)
    let hex = '';
    for (const byte of b) hex += byte.toString(16).padStart(2, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async pbkdf2Sha256(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array> {
    return pbkdf2Async(sha256, new TextEncoder().encode(password), salt, {
      c:     iterations,
      dkLen: keyLengthBytes,
    });
  }

  async aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    return gcm(key, iv).encrypt(plaintext);
  }

  async aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array> {
    return gcm(key, iv).decrypt(ciphertextAndTag);
  }
}
