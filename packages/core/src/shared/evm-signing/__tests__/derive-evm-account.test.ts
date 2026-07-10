import { describe, expect, it } from 'vitest';
import { normaliseEvmPrivateKey, deriveEvmAccount } from '../derive-evm-account';

describe('normaliseEvmPrivateKey — secp256k1 range (KEY-9)', () => {
  it('accepts a valid in-range key (0x-prefixed or bare, any case)', () => {
    const k = '1'.padStart(64, '0');
    expect(normaliseEvmPrivateKey(k)).toBe(k);
    expect(normaliseEvmPrivateKey('0x' + k)).toBe(k);
  });

  it('rejects a wrong-length or non-hex key', () => {
    expect(() => normaliseEvmPrivateKey('1234')).toThrow(/32-byte hex/);
    expect(() => normaliseEvmPrivateKey('z'.repeat(64))).toThrow(/32-byte hex/);
  });

  it('rejects zero and any value at/above the group order n', () => {
    expect(() => normaliseEvmPrivateKey('0'.repeat(64))).toThrow(/secp256k1 range/);
    // n itself and n+1 are out of range.
    const n = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    expect(() => normaliseEvmPrivateKey(n)).toThrow(/secp256k1 range/);
    expect(() => normaliseEvmPrivateKey('f'.repeat(64))).toThrow(/secp256k1 range/);
  });

  it('the largest valid key (n-1) derives an address', () => {
    const nMinus1 = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';
    expect(deriveEvmAccount(nMinus1).address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
