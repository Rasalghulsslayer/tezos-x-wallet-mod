/**
 * CryptoPort: the platform's primitive crypto capabilities.
 *
 * These are the operations that have no acceptable pure-JS implementation and
 * differ per runtime: a browser/service-worker exposes them through Web Crypto
 * (`crypto.subtle`), while a React Native runtime (Hermes) has no `subtle` and
 * must reach for `@noble`. Everything above this seam — base64/UTF-8 framing,
 * the vault envelope, PBKDF2 work factor — is pure and shared (see
 * `shared/vault-crypto.ts`), so the only thing a new platform reimplements is
 * this port.
 *
 * AES-GCM convention: `aesGcmEncrypt` returns ciphertext with the 16-byte auth
 * tag appended (the Web Crypto layout), and `aesGcmDecrypt` expects the same.
 * Both implementations follow it, which is what makes a vault sealed on one
 * runtime openable on the other.
 */

export interface CryptoPort {
  /** Cryptographically secure random bytes. */
  randomBytes(length: number): Uint8Array;

  /** RFC 4122 v4 UUID, used for account ids. */
  randomUUID(): string;

  /** PBKDF2-HMAC-SHA256 → `keyLengthBytes` of derived key material. */
  pbkdf2Sha256(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array>;

  /** AES-256-GCM. `key` is 32 bytes, `iv` 12 bytes. Returns ciphertext‖tag. */
  aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;

  /** AES-256-GCM. `ciphertextAndTag` is ciphertext‖tag. Throws if the tag fails. */
  aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array>;
}
