/**
 * vault-crypto: the platform-agnostic vault envelope.
 *
 * It turns a plaintext string into an {@link EncryptedVault} (and back) using a
 * {@link CryptoPort} for the primitives that differ per runtime. The base64 and
 * UTF-8 framing here is pure JS — no `btoa`/`atob` — so the exact same envelope
 * runs under Web Crypto (extension) and `@noble` (mobile), which is what lets a
 * vault sealed on one device unlock on the other.
 */

import type { CryptoPort } from '../ports/crypto-port';
import type { EncryptedVault } from '../ports/vault-store';

// OWASP-recommended floor for PBKDF2-HMAC-SHA256 (also MetaMask's setting).
// The encrypted vault sits in plaintext on disk, so this work factor is the
// only cost an offline brute-force has to pay. Decryption reads the per-vault
// `iterations` field, so vaults created at lower counts keep unlocking and are
// re-encrypted at this count on their next mutation.
export const PBKDF2_ITERATIONS = 600_000;

const SALT_BYTES    = 16;
const IV_BYTES      = 12;
const AES_KEY_BYTES = 32;

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let outPos = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i]);
    const c1 = B64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = B64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = B64_ALPHABET.indexOf(clean[i + 3]);
    if (outPos < len) out[outPos++] = (c0 << 2) | (c1 >> 4);
    if (outPos < len && c2 >= 0) out[outPos++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (outPos < len && c3 >= 0) out[outPos++] = ((c2 & 0x03) << 6) | c3;
  }
  return out;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** Seal plaintext into a vault with caller-supplied salt/iv/iterations. Used by
 * {@link encryptVault} and, with fixed inputs, by cross-implementation test
 * vectors that assert two CryptoPorts produce byte-identical output. */
export async function sealVault(
  plaintext: string,
  password: string,
  crypto: CryptoPort,
  salt: Uint8Array,
  iv: Uint8Array,
  iterations: number,
): Promise<EncryptedVault> {
  const key = await crypto.pbkdf2Sha256(password, salt, iterations, AES_KEY_BYTES);
  const ciphertext = await crypto.aesGcmEncrypt(key, iv, utf8Encoder.encode(plaintext));
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv:         bytesToBase64(iv),
    salt:       bytesToBase64(salt),
    iterations,
  };
}

/** Seal plaintext with a fresh random salt/iv at the current work factor. */
export async function encryptVault(
  plaintext: string,
  password: string,
  crypto: CryptoPort,
): Promise<EncryptedVault> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv   = crypto.randomBytes(IV_BYTES);
  return sealVault(plaintext, password, crypto, salt, iv, PBKDF2_ITERATIONS);
}

/** Open a vault, deriving the key at the vault's own recorded work factor.
 * Throws if the password is wrong (GCM tag mismatch surfaces as a throw). */
export async function decryptVault(
  vault: EncryptedVault,
  password: string,
  crypto: CryptoPort,
): Promise<string> {
  const key = await crypto.pbkdf2Sha256(password, base64ToBytes(vault.salt), vault.iterations, AES_KEY_BYTES);
  const plaintext = await crypto.aesGcmDecrypt(key, base64ToBytes(vault.iv), base64ToBytes(vault.ciphertext));
  return utf8Decoder.decode(plaintext);
}
