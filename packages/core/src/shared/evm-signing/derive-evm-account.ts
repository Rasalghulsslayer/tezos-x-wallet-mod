/**
 * deriveEvmAccount: hex private key → checksum-cased 0x address + uncompressed
 * public key (0x04 || X(32) || Y(32)). secp256k1 + keccak256 only.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { hexToBytes, bytesToHex } from './bytes';
import { wipe } from '../wipe';

export interface EvmIdentity {
  address:    `0x${string}`;
  publicKey:  `0x${string}`;  // uncompressed, with 0x04 prefix
  privateKey: string;          // 64-hex without 0x prefix, for storage
}

/** Generate a random 32-byte secp256k1 private key, returned as 64-char hex
 *  without the 0x prefix. */
export function randomEvmPrivateKey(): string {
  const bytes = secp256k1.utils.randomSecretKey();
  return bytesToHex(bytes);
}

/** Normalise a user-supplied EVM private key to a 64-hex string (no 0x). */
export function normaliseEvmPrivateKey(input: string): string {
  const trimmed = input.trim();
  const noPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(noPrefix)) {
    throw new Error('Invalid EVM private key (expected 32-byte hex)');
  }
  return noPrefix.toLowerCase();
}

export function deriveEvmAccount(privateKeyHex: string): EvmIdentity {
  const normalised = normaliseEvmPrivateKey(privateKeyHex);
  const privBytes  = hexToBytes('0x' + normalised);

  const uncompressed = secp256k1.getPublicKey(privBytes, false);  // 65 bytes: 0x04 || X || Y
  wipe(privBytes);                                                 // key bytes done; only public data below
  const xy           = uncompressed.slice(1);                     // strip 0x04
  const hash         = keccak_256(xy);                             // 32 bytes
  const addrBytes    = hash.slice(-20);                            // last 20 bytes

  return {
    address:    toChecksumAddress(addrBytes) as `0x${string}`,
    publicKey:  `0x${bytesToHex(uncompressed)}` as `0x${string}`,
    privateKey: normalised,
  };
}

/** EIP-55 checksum address encoding. */
function toChecksumAddress(addrBytes: Uint8Array): string {
  const lower     = bytesToHex(addrBytes).toLowerCase();
  const hashOfHex = keccak_256(new TextEncoder().encode(lower));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (/[0-9]/.test(c)) {
      out += c;
    } else {
      const nibble = hashOfHex[i >> 1];
      const high   = (i & 1) === 0;
      const bit    = high ? (nibble >> 4) & 0xf : nibble & 0xf;
      out += bit >= 8 ? c.toUpperCase() : c;
    }
  }
  return out;
}
