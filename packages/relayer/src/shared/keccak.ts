/**
 * keccak: keccak256 hash of a UTF-8 string, returned as a 0x-prefixed
 * 32-byte hex digest.
 */

import { keccak256, toBytes } from 'viem';

export function keccak(input: string): `0x${string}` {
  return keccak256(toBytes(input));
}
