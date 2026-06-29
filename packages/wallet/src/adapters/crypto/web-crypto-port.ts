/**
 * WebCryptoPort: CryptoPort backed by Web Crypto (`crypto.subtle`).
 *
 * The implementation for any context that has Web Crypto — the extension
 * service worker, and the Node test runner. PBKDF2 derives raw key bytes via
 * `deriveBits` (rather than a non-extractable `deriveKey` CryptoKey) so the
 * derived material matches the @noble path exactly and the same envelope code
 * drives both.
 */

import type { CryptoPort } from '@tezosx/wallet-core/ports/crypto-port';

export class WebCryptoPort implements CryptoPort {
  randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  randomUUID(): string {
    return crypto.randomUUID();
  }

  async pbkdf2Sha256(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
      baseKey,
      keyLengthBytes * 8,
    );
    return new Uint8Array(bits);
  }

  async aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const aesKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
    const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, aesKey, plaintext as BufferSource);
    return new Uint8Array(out);
  }

  async aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array> {
    const aesKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertextAndTag as BufferSource,
    );
    return new Uint8Array(out);
  }
}
