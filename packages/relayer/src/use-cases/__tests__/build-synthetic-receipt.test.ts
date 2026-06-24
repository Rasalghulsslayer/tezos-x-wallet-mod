import { describe, it, expect } from 'vitest';
import { l1OpHashToEvmHash } from '../build-synthetic-receipt';

// Independent Keccak-256 known-answer vectors (Ethereum keccak256 — original
// Keccak padding, not NIST SHA3). These are published constants, NOT generated
// by the code under test: keccak256('') is the canonical Ethereum empty hash.
const KECCAK_EMPTY = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
const KECCAK_ABC   = '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45';

describe('l1OpHashToEvmHash — synthetic EVM hash derivation (keccak256 KAT)', () => {
  it('matches the canonical empty-string keccak256 vector', () => {
    expect(l1OpHashToEvmHash('')).toBe(KECCAK_EMPTY);
  });

  it('matches the "abc" keccak256 vector', () => {
    expect(l1OpHashToEvmHash('abc')).toBe(KECCAK_ABC);
  });

  it('is deterministic and shaped as a 32-byte 0x hash', () => {
    const op = 'onq3VxGEh9bTUuRwAmkjnYM9JTm3qz9ELzKbqcs2WfXoP9CkF2t';
    const h = l1OpHashToEvmHash(op);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(l1OpHashToEvmHash(op)).toBe(h);
  });

  it('varies with the opHash (not a constant)', () => {
    expect(l1OpHashToEvmHash('opA')).not.toBe(l1OpHashToEvmHash('opB'));
  });
});
