/**
 * keccak256: SHA3 Keccak-256 hash of arbitrary bytes, returned as a
 * 0x-prefixed 32-byte hex string.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from './bytes';

export function keccak256(data: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(keccak_256(data))}` as `0x${string}`;
}
