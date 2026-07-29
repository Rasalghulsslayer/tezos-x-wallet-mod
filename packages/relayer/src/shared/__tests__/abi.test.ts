import { describe, expect, it } from 'vitest';
import { encodeErc20Transfer } from '../abi.js';

describe('encodeErc20Transfer', () => {
  it('matches the hand-computed transfer(address,uint256) ABI encoding (KAT)', () => {
    // selector a9059cbb · address right-aligned in 32 bytes · uint256 amount.
    const to = '0x1111111111111111111111111111111111111111';
    const amount = 5_000_000n; // 0x4c4b40
    const expected =
      '0xa9059cbb' +
      '000000000000000000000000' + '1111111111111111111111111111111111111111' +
      '00000000000000000000000000000000000000000000000000000000004c4b40';
    expect(encodeErc20Transfer(to, amount)).toBe(expected);
  });

  it('encodes a zero amount into a fixed-width two-word payload', () => {
    const out = encodeErc20Transfer('0x1111111111111111111111111111111111111111', 0n);
    expect(out.startsWith('0xa9059cbb')).toBe(true);
    expect(out.endsWith('0'.repeat(64))).toBe(true);      // amount word = 0
    expect(out).toHaveLength(2 + 8 + 64 + 64);             // 0x + selector + addr word + amount word
  });
});
