/**
 * l1OpHashToEvmHash: keccak256 of a Michelson opHash, returned as a 32-byte
 * EVM-style hex hash. Used to derive the synthetic EVM mirror of a
 * cross-runtime operation so callers can poll for the real receipt.
 */

import { keccak } from '../shared/keccak.js';

export function l1OpHashToEvmHash(l1OpHash: string): string {
  return keccak(l1OpHash);
}